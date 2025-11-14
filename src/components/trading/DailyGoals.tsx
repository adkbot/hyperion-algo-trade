import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Target, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { useDailyGoals } from "@/hooks/useTradingData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DailyGoals = () => {
  const { data: goals } = useDailyGoals();

  // Buscar operações por sessão
  const { data: sessionTrades } = useQuery({
    queryKey: ['session-trades-count'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('session_trade_count')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today);
      
      return data || [];
    },
    refetchInterval: 3000,
  });

  // Calcular total de operações por sessão (4 sessões = 4 operações máx/dia)
  const maxSessionsPerDay = 4; // OCEANIA, ASIA, LONDON, NY
  const maxOperationsPerSession = 1;
  const totalSessionOps = sessionTrades?.reduce((sum, s) => sum + (s.trade_count || 0), 0) || 0;
  
  const dailyStats = {
    wins: goals?.wins || 0,
    losses: goals?.losses || 0,
    maxLosses: 2, // 1/2 tolerância = máximo 2 losses consecutivos
    dailyProfit: goals?.total_pnl || 0
  };

  const lossPercent = (dailyStats.losses / dailyStats.maxLosses) * 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Operações por Sessão</CardTitle>
          <Badge className={dailyStats.dailyProfit >= 0 ? "bg-profit" : "bg-loss"}>
            {dailyStats.dailyProfit >= 0 ? '+' : ''}${dailyStats.dailyProfit.toFixed(2)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Operações por Sessão */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-muted-foreground">Operações Hoje</span>
            </div>
            <span className="font-bold">
              {totalSessionOps} / {maxSessionsPerDay}
            </span>
          </div>
          <Progress value={(totalSessionOps / maxSessionsPerDay) * 100} className="h-3" />
          <div className="text-xs text-muted-foreground">
            <div>✓ {maxOperationsPerSession} operação por sessão</div>
            <div>✓ Máximo {maxSessionsPerDay} sessões/dia</div>
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
      </CardContent>
    </Card>
  );
};
