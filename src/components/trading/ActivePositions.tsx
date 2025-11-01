import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, TrendingUp } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const ActivePositions = () => {
  const activePositions = [
    {
      asset: "BTCUSDT",
      type: "buy",
      entry: 67500,
      current: 67850,
      target: 68500,
      sl: 67300,
      pnl: 105.00,
      rr: "1:4.2",
      projectedProfit: 300.50,
      progressPercent: 35,
      timeInPosition: "12m 34s"
    },
    {
      asset: "ETHUSDT",
      type: "sell",
      entry: 3290,
      current: 3260,
      target: 3200,
      sl: 3320,
      pnl: 90.00,
      rr: "1:3.8",
      projectedProfit: 270.00,
      progressPercent: 42,
      timeInPosition: "8m 15s"
    }
  ];

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
