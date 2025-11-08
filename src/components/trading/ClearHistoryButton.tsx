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
    if (!user?.id) return;

    try {
      const { data, error } = await supabase.functions.invoke('clear-user-history', {
        body: { user_id: user.id }
      });

      if (error) throw error;

      toast({
        title: "Histórico Limpo",
        description: "Todo o histórico de testes foi removido com sucesso.",
      });

      // Refresh page to update all components
      window.location.reload();
    } catch (error) {
      console.error('Error clearing history:', error);
      toast({
        title: "Erro",
        description: "Falha ao limpar histórico. Tente novamente.",
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
