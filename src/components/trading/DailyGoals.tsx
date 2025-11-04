import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { useDailyGoals } from "@/hooks/useTradingData";

export const DailyGoals = () => {
  const { data: goals } = useDailyGoals();

  const dailyStats = {
    targetOperations: goals?.target_operations || 45,
    completedOperations: goals?.total_operations || 0,
    wins: goals?.wins || 0,
    losses: goals?.losses || 0,
    maxLosses: goals?.max_losses || 15,
    projectedTime: goals?.projected_completion_time 
      ? new Date(goals.projected_completion_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : "--:--",
    currentTime: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    dailyProfit: goals?.total_pnl || 0
  };

  const remaining = dailyStats.targetOperations - dailyStats.completedOperations;
  const progressPercent = (dailyStats.completedOperations / dailyStats.targetOperations) * 100;
  const lossPercent = (dailyStats.losses / dailyStats.maxLosses) * 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Metas Diárias</CardTitle>
          <Badge className="bg-profit">+${dailyStats.dailyProfit.toFixed(2)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progresso de Operações */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Operações</span>
            </div>
            <span className="font-bold">
              {dailyStats.completedOperations}/{dailyStats.targetOperations}
            </span>
          </div>
          <Progress value={progressPercent} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Faltam {remaining} operações</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Win/Loss Rate */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-profit/10 border border-profit/30">
            <div className="flex items-center gap-2 text-profit mb-1">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium">Wins</span>
            </div>
            <div className="font-bold text-lg">{dailyStats.wins}</div>
          </div>
          <div className="p-3 rounded-lg bg-loss/10 border border-loss/30">
            <div className="flex items-center gap-2 text-loss mb-1">
              <TrendingDown className="h-4 w-4" />
              <span className="text-xs font-medium">Losses</span>
            </div>
            <div className="font-bold text-lg">
              {dailyStats.losses}/{dailyStats.maxLosses}
            </div>
          </div>
        </div>

        {/* Tolerância de Loss */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tolerância de Loss</span>
            <span className={`font-bold ${lossPercent > 80 ? "text-warning" : "text-foreground"}`}>
              {dailyStats.losses}/{dailyStats.maxLosses}
            </span>
          </div>
          <Progress 
            value={lossPercent} 
            className={`h-2 ${lossPercent > 80 ? "[&>div]:bg-warning" : ""}`} 
          />
          {lossPercent > 80 && (
            <div className="text-xs text-warning">⚠️ Próximo do limite de perdas</div>
          )}
        </div>

        {/* Projeção de Tempo */}
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Clock className="h-4 w-4" />
            <span>Projeção para Meta</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Tempo Decorrido</div>
              <div className="font-mono font-bold">{dailyStats.currentTime}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Tempo Estimado</div>
              <div className="font-mono font-bold text-primary">{dailyStats.projectedTime}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
