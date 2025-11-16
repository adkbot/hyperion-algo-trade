import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useTradingOrchestrator = (botStatus: "stopped" | "running" | "paused") => {
  const { toast } = useToast();
  const intervalRef = useRef<number>();
  const consecutiveErrorsRef = useRef<number>(0);
  const lastErrorToastRef = useRef<number>(0);

  useEffect(() => {
    const callOrchestrator = async (retryCount = 0): Promise<void> => {
      try {
        console.log(`📡 Calling trading orchestrator... (attempt ${retryCount + 1})`);
        
        // Timeout de 45 segundos (ajustado para intervalo de 15s)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);

        const { data, error } = await supabase.functions.invoke("trading-orchestrator", {
          method: "POST",
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (error) {
          // Identificar tipo de erro
          const isTimeout = error.message?.includes('aborted') || error.message?.includes('timeout');
          const isNetworkError = error.message?.includes('network') || error.message?.includes('Network connection lost');
          
          console.error("❌ Orchestrator error:", error);
          console.error("Error details:", {
            message: error.message,
            context: error.context,
            name: error.name,
            isTimeout,
            isNetworkError,
          });
          
          // Se for timeout ou erro de rede, tentar novamente (máximo 3 vezes)
          if ((isTimeout || isNetworkError) && retryCount < 2) {
            const delay = Math.pow(2, retryCount) * 2000; // 2s, 4s
            console.log(`🔄 ${isTimeout ? 'Timeout' : 'Network error'} - Tentando novamente em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callOrchestrator(retryCount + 1);
          }
          
          // Se falhar, tentar novamente (máximo 3 vezes com delay exponencial)
          if (retryCount < 2) {
            const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s
            console.log(`🔄 Tentando novamente em ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return callOrchestrator(retryCount + 1);
          }
          
          // Após 3 falhas, incrementar erro
          consecutiveErrorsRef.current += 1;
          
          // Só mostrar toast após 5 erros consecutivos E se já passou 60s desde o último toast
          const now = Date.now();
          const timeSinceLastToast = now - lastErrorToastRef.current;
          
          if (consecutiveErrorsRef.current >= 5 && timeSinceLastToast > 60000) {
            toast({
              title: "⚠️ Erro no Orchestrator",
              description: isTimeout 
                ? "Timeout - A análise está levando mais tempo que o esperado." 
                : isNetworkError
                ? "Erro de rede - Verifique sua conexão."
                : "Múltiplas falhas detectadas. Verifique a conexão.",
              variant: "destructive",
              duration: 5000,
            });
            lastErrorToastRef.current = now;
            consecutiveErrorsRef.current = 0; // Reset counter após mostrar toast
          }
          
          return;
        }

        // Resetar contador de erros após sucesso
        consecutiveErrorsRef.current = 0;

        if (data) {
          console.log("✅ Orchestrator response:", data);
          
          // Log successful operations
          if (data.analysis && data.analysis.length > 0) {
            const signals = data.analysis.filter((a: any) => a.analysis?.signal !== 'STAY_OUT');
            if (signals.length > 0) {
              console.log(`📊 ${signals.length} trade signal(s) detected:`, signals);
            }
          }
          
          if (data.activePositions > 0) {
            console.log(`💼 Active positions: ${data.activePositions}`);
          }
        }
      } catch (error) {
        const isTimeout = error instanceof Error && (
          error.name === 'AbortError' || 
          error.message?.includes('aborted') ||
          error.message?.includes('timeout')
        );
        
        console.error("Error calling orchestrator:", error);
        console.error("Error type:", {
          name: error instanceof Error ? error.name : 'unknown',
          isTimeout,
        });
        
        // Se for timeout, não incrementar erros (é esperado ocasionalmente)
        if (!isTimeout) {
          consecutiveErrorsRef.current += 1;
        }
      }
    };

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Start orchestrator loop when bot is running
    if (botStatus === "running") {
      // Call immediately
      callOrchestrator();
      
      // Then call every 15 seconds for faster signal detection
      intervalRef.current = window.setInterval(() => {
        callOrchestrator();
      }, 15000);
    }

    // Cleanup on unmount or status change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [botStatus, toast]);
};
