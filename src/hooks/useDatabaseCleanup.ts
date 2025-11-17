import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useDatabaseCleanup = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('cleanup-database');
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['daily-goals'] });
      queryClient.invalidateQueries({ queryKey: ['session-history'] });
      queryClient.invalidateQueries({ queryKey: ['operations'] });
      queryClient.invalidateQueries({ queryKey: ['session-trades-count'] });
      queryClient.invalidateQueries({ queryKey: ['active-signals'] });
      queryClient.invalidateQueries({ queryKey: ['agent-logs'] });
      
      toast({
        title: "🧹 Limpeza Completa",
        description: `Banco de dados limpo com sucesso! ${data.summary.session_history_deleted} históricos, ${data.summary.operations_deleted} operações antigas removidas.`,
      });
    },
    onError: (error: any) => {
      console.error('Erro na limpeza do banco:', error);
      toast({
        title: "Erro na limpeza",
        description: error.message || "Falha ao limpar banco de dados",
        variant: "destructive",
      });
    }
  });
};
