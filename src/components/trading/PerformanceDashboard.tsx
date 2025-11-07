import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useOperations, useDailyGoals } from "@/hooks/useTradingData";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { TrendingUp, Target, Award, Activity } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const PerformanceDashboard = () => {
  const { data: operations } = useOperations();
  const { data: dailyGoals } = useDailyGoals();

  // Prepare P&L over time data
  const pnlData = operations
    ?.filter(op => op.result !== null)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .reduce((acc: any[], op, index) => {
      const cumulativePnl = index === 0 ? op.pnl : acc[index - 1].cumulative + op.pnl;
      acc.push({
        operation: index + 1,
        pnl: op.pnl,
        cumulative: cumulativePnl,
        time: new Date(op.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      });
      return acc;
    }, []) || [];

  // Win/Loss distribution
  const wins = operations?.filter(op => op.result === 'win').length || 0;
  const losses = operations?.filter(op => op.result === 'loss').length || 0;
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  const pieData = [
    { name: 'Vitórias', value: wins, color: 'hsl(var(--profit))' },
    { name: 'Perdas', value: losses, color: 'hsl(var(--loss))' }
  ];

  // Operations progress
  const totalOps = dailyGoals?.total_operations || 0;
  const targetOps = dailyGoals?.target_operations || 45;
  const progress = (totalOps / targetOps) * 100;

  // Hourly performance (last 6 hours)
  const hourlyPnl = operations
    ?.filter(op => op.result !== null)
    .reduce((acc: any[], op) => {
      const hour = new Date(op.created_at).getHours();
      const existing = acc.find(item => item.hour === hour);
      if (existing) {
        existing.pnl += op.pnl;
        existing.count += 1;
      } else {
        acc.push({ hour: `${hour}h`, pnl: op.pnl, count: 1 });
      }
      return acc;
    }, [])
    .sort((a, b) => parseInt(a.hour) - parseInt(b.hour))
    .slice(-6) || [];

  const totalPnl = dailyGoals?.total_pnl || 0;

  return (
    <div className="space-y-4">
      {/* KPIs Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">P&L Total</p>
                <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  ${totalPnl.toFixed(2)}
                </p>
              </div>
              <TrendingUp className={`h-8 w-8 ${totalPnl >= 0 ? 'text-profit' : 'text-loss'}`} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Win Rate</p>
                <p className="text-2xl font-bold text-profit">{winRate.toFixed(1)}%</p>
              </div>
              <Award className="h-8 w-8 text-profit" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Operações</p>
                <p className="text-2xl font-bold text-foreground">{totalOps}/{targetOps}</p>
              </div>
              <Activity className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Meta Diária</p>
                <p className="text-2xl font-bold text-primary">{progress.toFixed(0)}%</p>
              </div>
              <Target className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cumulative P&L Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">P&L Acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={pnlData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis 
                  dataKey="time" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Line 
                  type="monotone" 
                  dataKey="cumulative" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Win/Loss Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Distribuição Vitórias/Perdas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Hourly Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Performance por Hora</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={hourlyPnl}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" />
                <XAxis 
                  dataKey="hour" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px'
                  }}
                />
                <Bar 
                  dataKey="pnl" 
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Progress to Daily Goal */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Progresso da Meta Diária</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Operações Concluídas</span>
                <span className="text-sm font-bold text-foreground">{totalOps} / {targetOps}</span>
              </div>
              <Progress value={progress} className="h-3" />
              <p className="text-xs text-muted-foreground mt-1">
                {targetOps - totalOps > 0 ? `${targetOps - totalOps} operações restantes` : 'Meta atingida! 🎉'}
              </p>
            </div>

            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Perdas Toleradas</span>
                <span className="text-sm font-bold text-foreground">
                  {dailyGoals?.losses || 0} / {dailyGoals?.max_losses || 15}
                </span>
              </div>
              <Progress 
                value={((dailyGoals?.losses || 0) / (dailyGoals?.max_losses || 15)) * 100} 
                className="h-3"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="text-center p-3 rounded-lg bg-profit/10">
                <p className="text-2xl font-bold text-profit">{wins}</p>
                <p className="text-xs text-muted-foreground">Vitórias</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-loss/10">
                <p className="text-2xl font-bold text-loss">{losses}</p>
                <p className="text-xs text-muted-foreground">Perdas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
