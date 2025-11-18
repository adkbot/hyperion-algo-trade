import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowDown, ArrowUp, TrendingUp, RefreshCw, AlertTriangle, XCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useActivePositions } from "@/hooks/useTradingData";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { ClosePositionButton } from "./ClosePositionButton";
import { useEmergencyClose } from "@/hooks/useEmergencyClose";

export const ActivePositions = () => {
  const { data: positions } = useActivePositions();
  const { toast } = useToast();
  const [syncing, setSyncing] = useState(false);
  const [binancePositions, setBinancePositions] = useState<any[]>([]);
  const emergencyClose = useEmergencyClose();

  // ═══════════════════════════════════════════════════════════════════════════
  // 🔍 FASE 5: BUSCAR POSIÇÕES DA BINANCE PARA COMPARAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const fetchBinancePositions = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase.functions.invoke('sync-binance-positions', {
          body: { user_id: user.id, dry_run: true }
        });

        if (!error && data?.positions) {
          setBinancePositions(data.positions);
        }
      } catch (error) {
        console.error('Erro ao buscar posições da Binance:', error);
      }
    };

    fetchBinancePositions();
    const interval = setInterval(fetchBinancePositions, 30000); // Atualizar a cada 30s

    return () => clearInterval(interval);
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // 🧹 FORÇA LIMPEZA DE POSIÇÕES FANTASMAS
      const { data, error } = await supabase.functions.invoke('force-sync-positions', {
        body: { user_id: user.id }
      });

      if (error) throw error;

      toast({
        title: "✅ Sincronização completa",
        description: `${data.valid_positions} posições válidas, ${data.removed} posições fantasmas removidas`,
      });
      
      // Recarregar a página para atualizar a UI
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "❌ Erro na sincronização",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSyncing(false);
    }
  };

  const calculateProgress = (entry: number, current: number, target: number, direction: string) => {
    if (direction === 'BUY') {
      return ((current - entry) / (target - entry)) * 100;
    } else {
      return ((entry - current) / (entry - target)) * 100;
    }
  };

  const calculateTimeInPosition = (openedAt: string) => {
    const now = new Date().getTime();
    const opened = new Date(openedAt).getTime();
    const diff = Math.floor((now - opened) / 1000);
    const minutes = Math.floor(diff / 60);
    const seconds = diff % 60;
    return `${minutes}m ${seconds}s`;
  };

  // ✅ Função para formatar preços com casas decimais adequadas
  const formatPrice = (price: number) => {
    if (price < 1) {
      // Para preços < 1, mostrar até 8 casas decimais (removendo zeros à direita)
      return `$${price.toFixed(8).replace(/\.?0+$/, '')}`;
    }
    // Para preços >= 1, usar 2 casas decimais
    return `$${price.toFixed(2)}`;
  };

  const activePositions = positions?.map((pos) => {
    const progressPercent = calculateProgress(
      pos.entry_price,
      pos.current_price || pos.entry_price,
      pos.take_profit,
      pos.direction
    );

    return {
      asset: pos.asset,
      type: pos.direction.toLowerCase(), // 'buy' or 'sell'
      entry: pos.entry_price,
      current: pos.current_price || pos.entry_price,
      target: pos.take_profit,
      sl: pos.stop_loss,
      pnl: pos.current_pnl || 0,
      rr: `1:${pos.risk_reward.toFixed(1)}`,
      projectedProfit: pos.projected_profit,
      progressPercent: Math.max(0, Math.min(100, progressPercent)),
      timeInPosition: calculateTimeInPosition(pos.opened_at),
    };
  }) || [];

  // ═══════════════════════════════════════════════════════════════════════════
  // 🚨 FASE 5: DETECTAR POSIÇÕES NÃO MONITORADAS
  // ═══════════════════════════════════════════════════════════════════════════
  const unmatchedPositions = binancePositions.filter(bp => 
    !positions?.some(ap => ap.asset === bp.symbol) && 
    Math.abs(parseFloat(bp.positionAmt)) > 0
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Posições Ativas</CardTitle>
            <Badge variant="outline" className="border-success text-success text-xs">
              {activePositions.length}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ClosePositionButton />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={syncing}
              className="h-8 px-2 text-xs"
              title={syncing ? 'Sincronizando...' : 'Sincronizar'}
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${syncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{syncing ? 'Sincronizando...' : 'Sincronizar'}</span>
              <span className="sm:hidden">Sync</span>
            </Button>
            <Button 
              onClick={() => {
                if (confirm('⚠️ ATENÇÃO: Isso vai FECHAR TODAS as posições na Binance e limpar o banco de dados. Continuar?')) {
                  const userId = positions?.[0]?.user_id;
                  if (userId) {
                    emergencyClose.mutate(userId);
                  }
                }
              }}
              disabled={emergencyClose.isPending}
              variant="destructive"
              size="sm"
              className="h-8 px-2 text-xs whitespace-nowrap"
            >
              <XCircle className="h-3 w-3 mr-1" />
              {emergencyClose.isPending ? 'Fechando...' : 'Emergência'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* 🚨 ALERTA DE POSIÇÕES NÃO MONITORADAS (FASE 5) */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {unmatchedPositions.length > 0 && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="font-semibold">⚠️ Posições não monitoradas</AlertTitle>
            <AlertDescription>
              <div className="mt-2 space-y-1">
                <p className="text-sm">
                  {unmatchedPositions.length} posição(ões) aberta(s) manualmente na Binance 
                  <strong className="text-destructive-foreground"> sem proteção de stop loss</strong>.
                </p>
                <div className="flex flex-col gap-1 mt-2 text-xs">
                  {unmatchedPositions.map((pos, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-destructive/10 rounded px-2 py-1">
                      <span className="font-mono">{pos.symbol}</span>
                      <span className={parseFloat(pos.unRealizedProfit) >= 0 ? 'text-success' : 'text-destructive'}>
                        ${parseFloat(pos.unRealizedProfit).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
                <Button 
                  variant="destructive" 
                  size="sm" 
                  onClick={handleSync}
                  disabled={syncing}
                  className="mt-3 w-full"
                >
                  {syncing ? 'Sincronizando...' : 'Sincronizar e Proteger Agora'}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {activePositions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            Nenhuma posição ativa no momento
          </div>
        ) : (
          activePositions.map((position, index) => (
            <div key={index} className="p-4 rounded-lg bg-secondary/50 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 font-bold ${position.type === "buy" ? "text-profit" : "text-loss"}`}>
                    {position.type === "buy" ? <ArrowUp className="h-5 w-5" /> : <ArrowDown className="h-5 w-5" />}
                    {position.asset}
                  </div>
                  <Badge variant="outline">{position.rr}</Badge>
                </div>
                <div className="text-right">
                  <div className={`font-bold text-lg ${position.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                    +${position.pnl.toFixed(2)}
                  </div>
                  <div className="text-xs text-muted-foreground">{position.timeInPosition}</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Entrada:</span>
                  <div className="font-mono font-medium">{formatPrice(position.entry)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Atual:</span>
                  <div className="font-mono font-medium">{formatPrice(position.current)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Alvo:</span>
                  <div className="font-mono font-medium">{formatPrice(position.target)}</div>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Projeção de Lucro
                  </span>
                  <span className="font-bold text-profit">+${position.projectedProfit.toFixed(2)}</span>
                </div>
                <Progress value={position.progressPercent} className="h-2" />
                <div className="text-xs text-muted-foreground text-right">{position.progressPercent}% até o alvo</div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};
