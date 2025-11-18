import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useCancelAllOrders = () => {
  return useMutation({
    mutationFn: async (symbol?: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('cancel-all-orders', {
        body: { 
          user_id: user.id,
          symbol: symbol || null
        }
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('✅ Todas as ordens abertas foram canceladas na Binance');
    },
    onError: (error: Error) => {
      toast.error(`❌ Erro ao cancelar ordens: ${error.message}`);
    }
  });
};
