import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useClearScalpingHistory = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase.functions.invoke("clear-scalping-history", {
        body: { user_id: user.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-signals"] });
      queryClient.invalidateQueries({ queryKey: ["agent-logs"] });
      
      toast({
        title: "🧹 Histórico Limpo",
        description: "Aguardando novos sinais da estratégia Scalping 1 Min",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao limpar histórico",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
