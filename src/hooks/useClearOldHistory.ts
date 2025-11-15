import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useClearOldHistory = () => {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase.functions.invoke("clear-old-history", {
        body: { user_id: user.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "🧹 Histórico Limpo",
        description: data.message || "Registros antigos removidos com sucesso",
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
