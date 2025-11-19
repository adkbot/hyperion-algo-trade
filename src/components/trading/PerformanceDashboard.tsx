import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertCircle, Target } from "lucide-react";

export const PerformanceDashboard = () => {
  const { data: metrics } = useQuery({
    queryKey: ['performance-metrics'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('performance_metrics')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .single();

      if (error) {
        console.log('Métricas não encontradas, criando padrão');
        return {
          signals_detected: 0,
          signals_executed: 0,
          signals_expired: 0,
          signals_rejected: 0,
          total_operations: 0,
          wins: 0,
          losses: 0,
          win_rate: 0,
          total_pnl: 0,
          max_drawdown: 0,
          avg_rr: 0
        };
      }

      return data;
    },
    refetchInterval: 10000
  });

  if (!metrics) return null;

  const executionRate = metrics.signals_detected > 0 
    ? (metrics.signals_executed / metrics.signals_detected) * 100 
    : 0;

  const expirationRate = metrics.signals_detected > 0
    ? (metrics.signals_expired / metrics.signals_detected) * 100
    : 0;

  return (
    <Card className="p-3 sm:p-4 bg-background/95 backdrop-blur border-border/50">
      <div className="space-y-3 sm:space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs sm:text-sm font-semibold text-foreground">Performance Hoje</h3>
          <Target className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          {/* Sinais */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Sinais Detectados</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground">{metrics.signals_detected}</p>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Taxa de Execução</p>
            <div className="flex items-baseline gap-1 sm:gap-2">
              <p className="text-xl sm:text-2xl font-bold text-foreground">{executionRate.toFixed(0)}%</p>
              {expirationRate > 50 && (
                <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 text-destructive" />
              )}
            </div>
          </div>

          {/* Operações */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <div className="flex items-baseline gap-1 sm:gap-2">
              <p className="text-xl sm:text-2xl font-bold text-foreground">
                {metrics.total_operations > 0 ? (metrics.win_rate * 100).toFixed(0) : 0}%
              </p>
              {metrics.total_operations > 0 && (
                <span className="text-xs text-muted-foreground">
                  ({metrics.wins}/{metrics.total_operations})
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">P&L Hoje</p>
            <div className="flex items-baseline gap-1">
              <p className={`text-xl sm:text-2xl font-bold ${
                metrics.total_pnl > 0 ? 'text-green-500' : 
                metrics.total_pnl < 0 ? 'text-red-500' : 
                'text-foreground'
              }`}>
                ${metrics.total_pnl.toFixed(2)}
              </p>
              {metrics.total_pnl > 0 && <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4 text-green-500" />}
              {metrics.total_pnl < 0 && <TrendingDown className="h-3 w-3 sm:h-4 sm:w-4 text-red-500" />}
            </div>
          </div>
        </div>

        {/* Alertas */}
        {expirationRate > 70 && (
          <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
            <p className="text-xs text-destructive">
              ⚠️ Alta taxa de expiração ({expirationRate.toFixed(0)}%) - Verifique executor automático
            </p>
          </div>
        )}

        {metrics.max_drawdown < -0.08 && (
          <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
            <p className="text-xs text-destructive">
              📉 Drawdown elevado: {(metrics.max_drawdown * 100).toFixed(1)}%
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};
