import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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

export const ResetDayButton = () => {
  const { toast } = useToast();

  const handleResetDay = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Usuário não autenticado",
          variant: "destructive",
        });
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // 1. Limpar contadores de sessão (session_trade_count)
      const { error: sessionError } = await supabase.functions.invoke('clear-session-counter', {
        body: { user_id: user.id }
      });

      if (sessionError) {
        console.error('Erro ao limpar contador de sessão:', sessionError);
      }

      // 2. Resetar apenas os contadores do dia atual (daily_goals)
      const { error: dailyError } = await supabase
        .from('daily_goals')
        .update({
          wins: 0,
          losses: 0,
          total_operations: 0,
          total_pnl: 0,
        })
        .eq('user_id', user.id)
        .eq('date', today);

      if (dailyError) throw dailyError;

      toast({
        title: "Dia resetado!",
        description: "Contadores diários e limites de sessão foram zerados.",
      });

      // Recarregar para atualizar os dados
      window.location.reload();
    } catch (error) {
      console.error('Erro ao resetar dia:', error);
      toast({
        title: "Erro ao resetar",
        description: "Não foi possível resetar os contadores do dia.",
        variant: "destructive",
      });
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm">
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset Dia
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Resetar contadores do dia?</AlertDialogTitle>
          <AlertDialogDescription>
            Isso irá zerar wins, losses e P&L do dia atual, mas manterá o histórico de operações.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleResetDay}>
            Resetar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
