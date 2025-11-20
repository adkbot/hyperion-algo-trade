import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useAutoClosePositions = (botStatus: 'stopped' | 'running' | 'paused') => {
  const intervalRef = useRef<number>();
  const { toast } = useToast();

  useEffect(() => {
    const checkTimeoutPositions = async () => {
      try {
        // 🔵 CORREÇÃO 2: Adicionar body vazio para evitar erro de JSON parse
        const { data, error } = await supabase.functions.invoke('auto-close-timeout-positions', {
          method: 'POST',
          body: {}
        });

        if (error) {
          console.error('⚠️ Erro ao verificar posições timeout:', error);
          return;
        }

        if (data?.closed > 0) {
          toast({
            title: '⏱️ Auto-Close Timeout',
            description: `${data.closed} posição(ões) fechada(s) por timeout (>3h30min)`,
            duration: 5000
          });
        }
      } catch (error) {
        console.error('⚠️ Erro ao executar auto-close:', error);
      }
    };

    // Limpar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (botStatus === 'running') {
      // Executar imediatamente
      checkTimeoutPositions();
      
      // Depois a cada 30 segundos
      intervalRef.current = window.setInterval(checkTimeoutPositions, 30000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [botStatus, toast]);
};
