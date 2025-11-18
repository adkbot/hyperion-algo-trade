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
    
    // Se não há estado anterior, apenas salvar o atual e retornar
    if (!prevState) {
      prevStateRef.current = currentState;
      return;
    }
    
    // Notificar apenas quando retest confirmado E sinal gerado (ADK 3-Step)
    const currentSignal = currentState.entry_signal?.signal;
    const prevSignal = prevState.entry_signal?.signal;
    const retestReady = currentState.retest_data?.entryReady;
    const prevRetestReady = prevState.retest_data?.entryReady;
    
    if (retestReady && currentSignal && currentSignal !== 'STAY_OUT' && 
        (!prevRetestReady || !prevSignal || prevSignal === 'STAY_OUT')) {
      toast({
        title: `🎯 ADK 3-STEP: ${currentSignal} APROVADO!`,
        description: `Retest confirmado | Entry: $${currentState.entry_signal?.risk?.entry?.toFixed(2)} | SL: $${currentState.entry_signal?.risk?.stop?.toFixed(2)} | TP: $${currentState.entry_signal?.risk?.target?.toFixed(2)}`,
        duration: 10000,
      });
    }
    
    prevStateRef.current = currentState;
  }, [query.data]);

  return query;
};
