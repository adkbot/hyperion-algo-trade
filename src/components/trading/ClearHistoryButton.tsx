import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const ClearHistoryButton = () => {
  const { toast } = useToast();
  const { user } = useAuth();

  const handleClearHistory = async () => {
    if (!user?.id) {
      console.error('No user ID found');
      return;
    }

    console.log('🗑️ Starting to clear history for user:', user.id);

    try {
      // Delete directly using authenticated client
      const deletions = await Promise.all([
        supabase.from('session_history').delete().eq('user_id', user.id),
        supabase.from('operations').delete().eq('user_id', user.id),
        supabase.from('active_positions').delete().eq('user_id', user.id),
        supabase.from('agent_logs').delete().eq('user_id', user.id),
        supabase.from('daily_goals').delete().eq('user_id', user.id),
        supabase.from('session_state').delete().eq('user_id', user.id),
      ]);

      console.log('Deletion results:', deletions);

      const errors = deletions.filter(d => d.error);
      if (errors.length > 0) {
        console.error('Errors during deletion:', errors);
        throw new Error('Falha ao limpar alguns dados');
      }

      toast({
        title: "Histórico Limpo ✅",
        description: "Todo o histórico de testes foi removido com sucesso.",
      });

      // Refresh page to update all components
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      console.error('Error clearing history:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao limpar histórico. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Limpar Histórico
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar Limpeza</AlertDialogTitle>
          <AlertDialogDescription>
            Isso vai remover PERMANENTEMENTE:
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Histórico de sessões</li>
              <li>Todas as operações</li>
              <li>Posições ativas</li>
              <li>Logs de agentes</li>
              <li>Metas diárias</li>
              <li>Estados de sessão</li>
            </ul>
            <p className="mt-4 font-semibold">Esta ação não pode ser desfeita!</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleClearHistory}>
            Confirmar Limpeza
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
