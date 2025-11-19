import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const usePendingSignalsExecutor = (botStatus: 'stopped' | 'running' | 'paused') => {
  const intervalRef = useRef<number>();
  const { toast } = useToast();

  useEffect(() => {
    const executeSignals = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('execute-pending-signals', {
          method: 'POST'
        });

        if (error) {
          console.error('Erro ao executar sinais:', error);
          return;
        }

        if (data?.executed > 0) {
          toast({
            title: '✅ Sinal Executado',
            description: `${data.executed} operação(ões) aberta(s)`,
            duration: 3000
          });
        }
      } catch (error) {
        console.error('Erro ao executar sinais:', error);
      }
    };

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (botStatus === 'running') {
      // Executar imediatamente
      executeSignals();
      
      // Depois a cada 5 segundos
      intervalRef.current = window.setInterval(executeSignals, 5000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [botStatus, toast]);
};
