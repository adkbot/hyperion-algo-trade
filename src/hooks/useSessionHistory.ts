import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useSessionHistory = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to session_history changes
    const channel = supabase
      .channel('session-history-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_history'
        },
        () => {
          // Invalidate and refetch session history data
          queryClient.invalidateQueries({ queryKey: ['session-history'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
};