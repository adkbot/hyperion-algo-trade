import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const useUpdateDailyGoals = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('update-daily-goals');
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['daily-goals'] });
      queryClient.invalidateQueries({ queryKey: ['session-trades-count'] });
      toast.success('Metas atualizadas com sucesso!');
    },
    onError: (error: any) => {
      console.error('Erro ao atualizar daily goals:', error);
      toast.error('Erro ao atualizar metas');
    }
  });
};
