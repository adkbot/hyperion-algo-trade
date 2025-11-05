import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useTradingOrchestrator = (botStatus: "stopped" | "running" | "paused") => {
  const { toast } = useToast();
  const intervalRef = useRef<number>();

  useEffect(() => {
    const callOrchestrator = async () => {
      try {
        console.log("Calling trading orchestrator...");
        
        const { data, error } = await supabase.functions.invoke("trading-orchestrator", {
          method: "POST",
        });

        if (error) {
          console.error("Orchestrator error:", error);
          toast({
            title: "Erro no Orchestrator",
            description: error.message,
            variant: "destructive",
          });
          return;
        }

        console.log("Orchestrator response:", data);
      } catch (error) {
        console.error("Error calling orchestrator:", error);
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
