import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { useUserSettings, useDailyGoals } from "@/hooks/useTradingData";

export const StatsPanel = () => {
  const { data: settings } = useUserSettings();
  const { data: dailyGoals } = useDailyGoals();

  const balance = settings?.balance || 0;
  const pnl = dailyGoals?.total_pnl || 0;
  const totalOps = dailyGoals?.total_operations || 0;
  const wins = dailyGoals?.wins || 0;
  const winRate = totalOps > 0 ? ((wins / totalOps) * 100).toFixed(0) : 0;

  const stats = [
    { label: "Saldo", value: `$${balance.toFixed(2)}`, icon: DollarSign, color: "text-foreground" },
    { label: "P&L Hoje", value: `$${pnl.toFixed(2)}`, icon: pnl >= 0 ? TrendingUp : TrendingDown, color: pnl >= 0 ? "text-profit" : "text-loss" },
    { label: "Operações", value: totalOps.toString(), icon: Activity, color: "text-foreground" },
    { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-profit" },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Estatísticas em Tempo Real</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-card ${stat.color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-sm text-muted-foreground">{stat.label}</span>
              </div>
              <span className={`font-mono font-bold ${stat.color}`}>{stat.value}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
