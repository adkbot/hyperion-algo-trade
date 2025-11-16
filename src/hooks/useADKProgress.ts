import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";

// Interfaces para os dados JSONB
interface FoundationData {
  isValid: boolean;
  high: number;
  low: number;
  timestamp: string;
}

interface FVG15mData {
  fvgDetected: boolean;
  sweepConfirmed: boolean;
  direction: 'BUY' | 'SELL';
  fvgTop: number;
  fvgBottom: number;
  fvgMidpoint: number;
  timestamp: number;
}

interface RetestData {
  hasRetest: boolean;
  entryReady: boolean;
  touchedMidpoint: boolean;
}

interface Confirmation1mData {
  confirmed: boolean;
  sweepDetected: boolean;
  fvgDetected: boolean;
}

interface EntrySignalData {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  risk?: {
    entry: number;
    stop: number;
    target: number;
    rr_ratio: number;
  };
}

interface ADKState {
  id: string;
  user_id: string;
  asset: string;
  date: string;
  current_phase: string;
  foundation_data: FoundationData | null;
  fvg15m_data: FVG15mData | null;
  retest_data: RetestData | null;
  confirmation1m_data: Confirmation1mData | null;
  entry_signal: EntrySignalData | null;
  next_action: string | null;
  updated_at: string;
  created_at: string;
}

export const useADKProgress = () => {
  const prevStateRef = useRef<ADKState | null>(null);

  const query = useQuery({
    queryKey: ['adk-progress'],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session?.session?.user?.id;
      
      if (!userId) return [];
      
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('adk_strategy_state')
        .select('*')
        .eq('user_id', userId)
        .eq('date', today)
        .order('updated_at', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error('Error fetching ADK progress:', error);
        throw error;
      }
      
      return (data || []) as unknown as ADKState[];
    },
    refetchInterval: 5000, // Atualiza a cada 5 segundos
  });

  // Notificações toast quando houver mudança de fase
  useEffect(() => {
    const adkStates = query.data;
    if (!adkStates || adkStates.length === 0) return;
    
    const currentState = adkStates[0];
    const prevState = prevStateRef.current;
    
    // Detectar mudanças de fase
    if (prevState && currentState.current_phase !== prevState.current_phase) {
      // Foundation completado
      if (currentState.current_phase === 'ADK_STEP_2_FVG_15M' && 
          currentState.foundation_data?.isValid) {
        toast({
          title: "✅ Foundation 15m detectada!",
          description: `High: $${currentState.foundation_data.high.toFixed(2)} | Low: $${currentState.foundation_data.low.toFixed(2)}`,
        });
      }
      
      // FVG 15m detectado
      if (currentState.current_phase === 'ADK_STEP_3_RETEST_50' && 
          currentState.fvg15m_data?.fvgDetected) {
        toast({
          title: "✅ FVG 15m + Sweep detectados!",
          description: `Direção: ${currentState.fvg15m_data.direction} | Aguardando retest em $${currentState.fvg15m_data.fvgMidpoint?.toFixed(2)}`,
        });
      }
      
      // Retest 50% completado
      if (currentState.current_phase === 'ADK_STEP_4_CONFIRMATION_1M' && 
          currentState.retest_data?.entryReady) {
        toast({
          title: "✅ Retest 50% confirmado!",
          description: "Aguardando confirmação no gráfico de 1 minuto...",
        });
      }
      
      // Confirmação 1m completa
      if (currentState.current_phase === 'ADK_COMPLETE' && 
          currentState.confirmation1m_data?.confirmed) {
        toast({
          title: "✅ Confirmação 1m completa!",
          description: "Processando sinal de entrada...",
        });
      }
      
      // Entry signal gerado
      if (currentState.entry_signal?.signal !== 'STAY_OUT' && 
          (!prevState.entry_signal || prevState.entry_signal?.signal === 'STAY_OUT')) {
        toast({
          title: `🎯 SINAL DE ENTRADA: ${currentState.entry_signal.signal}!`,
          description: `Entry: $${currentState.entry_signal.risk?.entry?.toFixed(2)} | SL: $${currentState.entry_signal.risk?.stop?.toFixed(2)} | TP: $${currentState.entry_signal.risk?.target?.toFixed(2)}`,
          duration: 10000,
        });
      }
    }
    
    prevStateRef.current = currentState;
  }, [query.data]);

  return query;
};
