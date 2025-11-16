import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { X } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export const ClosePositionButton = () => {
  const { toast } = useToast();
  const [isClosing, setIsClosing] = useState(false);
  const queryClient = useQueryClient();

  const handleClosePosition = async () => {
    setIsClosing(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      console.log("📤 Chamando binance-close-order para user:", user.id);

      const { data, error } = await supabase.functions.invoke('binance-close-order', {
        body: { 
          user_id: user.id 
        }
      });

      if (error) {
        console.error("❌ Erro ao fechar posição:", error);
        throw error;
      }

      // Caso especial: nenhuma posição ativa (não é erro crítico)
      if (!data?.success && data?.error === "Nenhuma posição ativa encontrada") {
        if (!confirm("⚠️ Não há posições ativas abertas. Deseja sincronizar com a Binance?")) {
          return;
        }
        // Sincronizar posições
        await supabase.functions.invoke('sync-binance-positions', {
          body: { user_id: user.id }
        });
        toast({
          title: "ℹ️ Nenhuma Posição Ativa",
          description: "Não há posições abertas para fechar. Posições sincronizadas.",
        });
        queryClient.invalidateQueries({ queryKey: ["activePositions"] });
        return;
      }

      if (!data?.success) {
        const errorMessage = data?.message || data?.error || "Falha ao fechar posição";
        throw new Error(errorMessage);
      }

      console.log("✅ Posição fechada:", data);

      toast({
        title: "✅ Posição Fechada",
        description: `${data.asset || 'Posição'} fechada com sucesso na Binance${data.pnl ? ` | P&L: $${data.pnl}` : ''}`,
      });

      // Invalidar queries para atualizar UI
      queryClient.invalidateQueries({ queryKey: ["activePositions"] });
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["dailyGoals"] });

    } catch (error: any) {
      console.error("❌ Erro:", error);
      toast({
        title: "❌ Erro ao Fechar Posição",
        description: error.message || "Falha ao fechar posição",
        variant: "destructive",
      });
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleClosePosition}
      disabled={isClosing}
      className="gap-2"
    >
      <X className="h-4 w-4" />
      {isClosing ? "Fechando..." : "Fechar Posição Binance"}
    </Button>
  );
};
