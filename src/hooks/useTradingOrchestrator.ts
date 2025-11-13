import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useTradingOrchestrator = (botStatus: "stopped" | "running" | "paused") => {
  const { toast } = useToast();
  const intervalRef = useRef<number>();
  const consecutiveErrorsRef = useRef<number>(0);
  const lastErrorToastRef = useRef<number>(0);

  useEffect(() => {
    const callOrchestrator = async () => {
      try {
        console.log("Calling trading orchestrator...");
        
        const { data, error } = await supabase.functions.invoke("trading-orchestrator", {
          method: "POST",
        });

        if (error) {
          console.error("❌ Orchestrator error:", error);
          console.error("Error details:", {
            message: error.message,
            context: error.context,
            name: error.name,
          });
          
          consecutiveErrorsRef.current += 1;
          
          // Só mostrar toast após 3 erros consecutivos E se já passou 30s desde o último toast
          const now = Date.now();
          const timeSinceLastToast = now - lastErrorToastRef.current;
          
          if (consecutiveErrorsRef.current >= 3 && timeSinceLastToast > 30000) {
            toast({
              title: "Erro no Orchestrator",
              description: "Múltiplas falhas ao chamar orchestrator. Verifique os logs.",
              variant: "destructive",
              duration: 5000, // Desaparece após 5 segundos
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
        console.error("Error calling orchestrator:", error);
        consecutiveErrorsRef.current += 1;
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
      
      // Then call every 10 seconds
      intervalRef.current = window.setInterval(() => {
        callOrchestrator();
      }, 10000);
    }

    // Cleanup on unmount or status change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [botStatus, toast]);
};
