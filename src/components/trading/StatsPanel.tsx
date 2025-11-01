import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, DollarSign, Activity } from "lucide-react";
import { useEffect, useState } from "react";

export const StatsPanel = () => {
  const [balance, setBalance] = useState(10000);
  const [pnl, setPnl] = useState(0);

  useEffect(() => {
    // Simulate real-time balance updates
    const interval = setInterval(() => {
      const change = (Math.random() - 0.5) * 10;
      setPnl((prev) => prev + change);
      setBalance((prev) => prev + change);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const stats = [
    { label: "Saldo", value: `$${balance.toFixed(2)}`, icon: DollarSign, color: "text-foreground" },
    { label: "P&L Hoje", value: `$${pnl.toFixed(2)}`, icon: pnl >= 0 ? TrendingUp : TrendingDown, color: pnl >= 0 ? "text-profit" : "text-loss" },
    { label: "Operações", value: "12", icon: Activity, color: "text-foreground" },
    { label: "Win Rate", value: "75%", icon: TrendingUp, color: "text-profit" },
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
