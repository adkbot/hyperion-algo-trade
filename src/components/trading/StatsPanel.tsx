import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw } from "lucide-react";
import { useUserSettings, useDailyGoals, useSyncBinanceBalance } from "@/hooks/useTradingData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const StatsPanel = () => {
  const { data: settings } = useUserSettings();
  const { data: dailyGoals } = useDailyGoals();
  const syncBalance = useSyncBinanceBalance();

  const balance = settings?.balance || 0;
  const pnl = dailyGoals?.total_pnl || 0;
  const totalOps = dailyGoals?.total_operations || 0;
  const wins = dailyGoals?.wins || 0;
  const winRate = totalOps > 0 ? ((wins / totalOps) * 100).toFixed(0) : 0;

  // Fetch strategy comparison data
  const { data: strategyStats } = useQuery({
    queryKey: ['strategy-comparison'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('operations')
        .select('strategy, pnl, result, exit_time')
        .eq('user_id', user.id)
        .gte('entry_time', `${today}T00:00:00Z`)
        .not('exit_time', 'is', null);
      
      if (!data) return [];
      
      // Group by strategy
      const grouped = data.reduce((acc: any, op: any) => {
        const strategy = op.strategy || 'UNKNOWN';
        if (!acc[strategy]) {
          acc[strategy] = { wins: 0, losses: 0, totalPnl: 0, trades: 0 };
        }
        acc[strategy].trades += 1;
        if (op.result === 'WIN') acc[strategy].wins += 1;
        if (op.result === 'LOSS') acc[strategy].losses += 1;
        acc[strategy].totalPnl += op.pnl || 0;
        return acc;
      }, {});
      
      return Object.entries(grouped).map(([strategy, stats]: [string, any]) => ({
        strategy,
        winRate: stats.trades > 0 ? ((stats.wins / stats.trades) * 100).toFixed(0) : '0',
        pnl: stats.totalPnl,
        trades: stats.trades,
      }));
    },
    refetchInterval: 5000,
  });

  const stats = [
    { label: "Saldo", value: `$${balance.toFixed(2)}`, icon: DollarSign, color: "text-foreground" },
    { label: "P&L Hoje", value: `$${pnl.toFixed(2)}`, icon: pnl >= 0 ? TrendingUp : TrendingDown, color: pnl >= 0 ? "text-profit" : "text-loss" },
    { label: "Operações", value: totalOps.toString(), icon: Activity, color: "text-foreground" },
    { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-profit" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <CardTitle className="text-base sm:text-lg">Estatísticas</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncBalance.mutate()}
          disabled={syncBalance.isPending}
          className="gap-1 w-full sm:w-auto text-xs"
        >
          <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 ${syncBalance.isPending ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Sincronizar</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="flex items-center justify-between p-2 sm:p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className={`p-1.5 sm:p-2 rounded-lg bg-card ${stat.color}`}>
                  <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                </div>
                <span className="text-xs sm:text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <span className={`font-mono font-bold text-sm sm:text-base ${stat.color}`}>{stat.value}</span>
            </div>
          );
        })}
        
        {/* Strategy Comparison */}
        {strategyStats && strategyStats.length > 0 && (
          <div className="pt-3 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2">📊 Comparação de Estratégias</div>
            <div className="space-y-2">
              {strategyStats.map((stat: any) => {
                const strategyConfig = {
                  FVG_MULTI_TF: { icon: '📈', color: 'text-purple-500', name: 'FVG Multi-TF' },
                  SCALPING_1MIN: { icon: '⚡', color: 'text-orange-500', name: 'Scalping 1min' },
                  SWEEP_LIQUIDITY: { icon: '🌊', color: 'text-blue-500', name: 'Sweep Liq.' },
                  FIRST_CANDLE_ADK: { icon: '🔷', color: 'text-cyan-500', name: 'ADK' },
                  UNKNOWN: { icon: '❓', color: 'text-gray-500', name: 'Desconhecida' },
                };
                const config = strategyConfig[stat.strategy as keyof typeof strategyConfig] || strategyConfig.UNKNOWN;
                
                return (
                  <div key={stat.strategy} className="flex items-center justify-between p-2 rounded bg-secondary/30 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <span className="font-medium">{config.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{stat.winRate}%</Badge>
                      <span className={`font-bold ${stat.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                        ${stat.pnl.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
