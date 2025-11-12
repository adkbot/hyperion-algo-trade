import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useSetupScalping1Min = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await supabase.functions.invoke("setup-scalping-1min", {
        body: { user_id: user.id },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
      queryClient.invalidateQueries({ queryKey: ["daily-goals"] });
      
      toast({
        title: "🎯 Scalping 1 Minuto Ativado!",
        description: "Estratégia configurada: 4 operações/dia (1 por sessão), R:R 3:1",
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao configurar estratégia",
        description: error.message,
        variant: "destructive",
      });
    },
  });
};
