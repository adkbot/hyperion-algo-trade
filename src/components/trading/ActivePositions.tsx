import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useActivePositions } from "@/hooks/useTradingData";

export const ActivePositions = () => {
  const { data: positions } = useActivePositions();

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Posições Ativas</CardTitle>
          <Badge variant="outline" className="border-success text-success">
            {activePositions.length} Posicionadas
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
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
                  <div className="font-mono font-medium">${position.entry.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Atual:</span>
                  <div className="font-mono font-medium">${position.current.toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Alvo:</span>
                  <div className="font-mono font-medium">${position.target.toLocaleString()}</div>
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
