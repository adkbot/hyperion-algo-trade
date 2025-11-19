import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const useRealtimeUpdates = () => {
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout>();

  const invalidateWithDebounce = (queryKey: string[]) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey });
    }, 1000); // Group multiple invalidations within 1 second
  };

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
          invalidateWithDebounce(["active-positions"]);
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
          invalidateWithDebounce(["operations"]);
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
          invalidateWithDebounce(["daily-goals"]);
          invalidateWithDebounce(["daily-history"]);
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
          invalidateWithDebounce(["agent-logs"]);
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
          invalidateWithDebounce(["user-settings"]);
        }
      )
      .subscribe();

    // Subscribe to adk_strategy_state changes
    const adkProgressChannel = supabase
      .channel('adk-progress-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'adk_strategy_state'
        },
        () => {
          console.log('ADK progress updated');
          invalidateWithDebounce(["adk-progress"]);
        }
      )
      .subscribe();

    // Cleanup subscriptions
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      supabase.removeChannel(positionsChannel);
      supabase.removeChannel(operationsChannel);
      supabase.removeChannel(goalsChannel);
      supabase.removeChannel(logsChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(adkProgressChannel);
    };
  }, [queryClient]);
};
