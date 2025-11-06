import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const useRealtimeUpdates = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Subscribe to active_positions changes
    const positionsChannel = supabase
      .channel('active-positions-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_positions'
        },
        () => {
          console.log('Active positions updated');
          queryClient.invalidateQueries({ queryKey: ["active-positions"] });
        }
      )
      .subscribe();

    // Subscribe to operations changes
    const operationsChannel = supabase
      .channel('operations-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'operations'
        },
        () => {
          console.log('Operations updated');
          queryClient.invalidateQueries({ queryKey: ["operations"] });
        }
      )
      .subscribe();

    // Subscribe to daily_goals changes
    const goalsChannel = supabase
      .channel('daily-goals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_goals'
        },
        () => {
          console.log('Daily goals updated');
          queryClient.invalidateQueries({ queryKey: ["daily-goals"] });
          queryClient.invalidateQueries({ queryKey: ["daily-history"] });
        }
      )
      .subscribe();

    // Subscribe to agent_logs changes
    const logsChannel = supabase
      .channel('agent-logs-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'agent_logs'
        },
        () => {
          console.log('Agent logs updated');
          queryClient.invalidateQueries({ queryKey: ["agent-logs"] });
        }
      )
      .subscribe();

    // Subscribe to user_settings changes
    const settingsChannel = supabase
      .channel('user-settings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_settings'
        },
        () => {
          console.log('User settings updated');
          queryClient.invalidateQueries({ queryKey: ["user-settings"] });
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(operationsChannel);
      supabase.removeChannel(goalsChannel);
      supabase.removeChannel(logsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [queryClient]);
};
