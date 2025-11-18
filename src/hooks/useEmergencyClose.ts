import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useEmergencyClose = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke('close-all-positions', {
        body: { user_id: userId }
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['active-positions'] });
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      
      toast({
        title: "🚨 Emergência Executada",
        description: `${data.closed} posições foram fechadas e sincronizadas`,
      });
    },
    onError: (error: any) => {
      console.error('Erro na emergência:', error);
      toast({
        title: "Erro ao fechar posições",
        description: error.message || "Falha ao executar fechamento de emergência",
        variant: "destructive",
      });
    }
  });
};
