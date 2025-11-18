import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

export const MarketAnalysisSummary = () => {
  // Fetch today's analysis summary
  const { data: summary } = useQuery({
    queryKey: ['market-analysis-summary'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('session_history')
        .select('signal, pair')
        .eq('user_id', user.id)
        .gte('timestamp', `${today}T00:00:00Z`);
      
      if (error) throw error;

      // Count signals by type
      const buySignals = data?.filter(s => s.signal === 'BUY' || s.signal === 'LONG').length || 0;
      const sellSignals = data?.filter(s => s.signal === 'SELL' || s.signal === 'SHORT').length || 0;
      const stayOutSignals = data?.filter(s => s.signal === 'STAY_OUT').length || 0;
      const total = data?.length || 0;

      // Count most analyzed pairs
      const pairCounts = data?.reduce((acc, item) => {
        acc[item.pair] = (acc[item.pair] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const topPairs = Object.entries(pairCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([pair, count]) => ({ pair, count }));

      return {
        total,
        buySignals,
        sellSignals,
        stayOutSignals,
        opportunityRate: total > 0 ? ((buySignals + sellSignals) / total * 100).toFixed(1) : '0',
        topPairs
      };
    },
    refetchInterval: 10000,
  });

  const chartData = [
    { name: 'BUY', value: summary?.buySignals || 0, color: '#22c55e' },
    { name: 'SELL', value: summary?.sellSignals || 0, color: '#ef4444' },
    { name: 'STAY OUT', value: summary?.stayOutSignals || 0, color: '#6b7280' },
  ].filter(item => item.value > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Resumo de Análises
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 rounded-lg bg-secondary/30 border">
            <p className="text-xs text-muted-foreground mb-1">Total</p>
            <p className="text-2xl font-bold">{summary?.total || 0}</p>
          </div>
          
          <div className="p-2 rounded-lg bg-success/10 border border-success/30">
            <p className="text-xs text-muted-foreground mb-1">Taxa de Oportunidade</p>
            <p className="text-2xl font-bold text-success">{summary?.opportunityRate}%</p>
          </div>
        </div>

        {/* Signal Breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <span className="text-muted-foreground">Sinais de Compra</span>
            </div>
            <Badge variant="outline" className="bg-success/10 text-success border-success">
              {summary?.buySignals || 0}
            </Badge>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-muted-foreground">Sinais de Venda</span>
            </div>
            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive">
              {summary?.sellSignals || 0}
            </Badge>
          </div>

          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Minus className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Stay Out</span>
            </div>
            <Badge variant="outline" className="bg-muted/50">
              {summary?.stayOutSignals || 0}
            </Badge>
          </div>
        </div>

        {/* Pie Chart */}
        {chartData.length > 0 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={30}
                  outerRadius={60}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Analyzed Pairs */}
        {summary?.topPairs && summary.topPairs.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-2">Pares mais analisados</p>
            <div className="space-y-1">
              {summary.topPairs.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{item.pair}</span>
                  <Badge variant="secondary" className="text-xs">
                    {item.count}x
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
