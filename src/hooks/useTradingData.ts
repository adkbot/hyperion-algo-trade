import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useUserSettings = () => {
  return useQuery({
    queryKey: ["user-settings"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      
      // Create settings if they don't exist
      if (!data) {
        const { data: newSettings, error: insertError } = await supabase
          .from("user_settings")
          .insert({
            user_id: user.id,
            balance: 10000,
            max_positions: 3,
            risk_per_trade: 0.06,
            paper_mode: true,
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        return newSettings;
      }
      
      return data;
    },
  });
};

export const useUpdateBotStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (status: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("user_settings")
        .update({ bot_status: status })
        .eq("user_id", user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast({
        title: "Status atualizado",
        description: "O status do bot foi atualizado com sucesso",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};

export const useActivePositions = () => {
  return useQuery({
    queryKey: ["active-positions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("active_positions")
        .select("*")
        .eq("user_id", user.id)
        .order("opened_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 2000, // Refresh every 2 seconds
  });
};

export const useOperations = () => {
  return useQuery({
    queryKey: ["operations"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("operations")
        .select("*")
        .eq("user_id", user.id)
        .order("entry_time", { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
  });
};

export const useDailyGoals = () => {
  return useQuery({
    queryKey: ["daily-goals"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from("daily_goals")
        .select("*")
        .eq("date", today)
        .eq("user_id", user.id)
        .maybeSingle();
      
      if (error) throw error;
      
      // If no goal exists for today, create one
      if (!data) {
        const { data: newGoal, error: insertError } = await supabase
          .from("daily_goals")
          .insert({
            date: today,
            user_id: user.id,
            target_operations: 45,
            max_losses: 15,
          })
          .select()
          .single();
        
        if (insertError) throw insertError;
        return newGoal;
      }
      
      return data;
    },
  });
};

export const useAgentLogs = () => {
  return useQuery({
    queryKey: ["agent-logs"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("agent_logs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000, // Refresh every 3 seconds
  });
};

export const useUpdateSettings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (settings: { 
      balance?: number; 
      max_positions?: number; 
      risk_per_trade?: number; 
      paper_mode?: boolean; 
      api_key?: string | null; 
      api_secret?: string | null;
      leverage?: number;
      profit_target_percent?: number;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from("user_settings")
        .update(settings)
        .eq("user_id", user.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      toast({
        title: "Configurações salvas",
        description: "As configurações foram atualizadas com sucesso",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
