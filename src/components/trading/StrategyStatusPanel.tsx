import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const STRATEGY_NAMES: Record<string, string> = {
  FVG_MULTI_TF: "FVG Multi-Timeframe",
  SCALPING_1MIN: "Scalping 1 Minuto",
  SWEEP_LIQUIDITY: "Sweep 2CR",
  ADK: "ADK Strategy"
};

export const StrategyStatusPanel = () => {
  // Fetch user settings to get active strategy
  const { data: settings } = useQuery({
    queryKey: ['user-settings-strategy'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data } = await supabase
        .from('user_settings')
        .select('trading_strategy, bot_status')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
  });

  // Fetch latest analysis (including STAY_OUT)
  const { data: latestAnalysis } = useQuery({
    queryKey: ['latest-strategy-analysis'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', user.id)
        .gte('timestamp', `${today}T00:00:00Z`)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000,
  });

  // Count today's analyses
  const { data: analysisCount } = useQuery({
    queryKey: ['analysis-count-today'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      
      const { count, error } = await supabase
        .from('session_history')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('timestamp', `${today}T00:00:00Z`);
      
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 5000,
  });

  const strategyName = settings?.trading_strategy 
    ? STRATEGY_NAMES[settings.trading_strategy] || settings.trading_strategy 
    : "Nenhuma";
  
  const isActive = settings?.bot_status === 'running';
  const signal = latestAnalysis?.signal;
  const notes = latestAnalysis?.notes;

  const getSignalColor = (sig: string) => {
    if (sig === 'BUY' || sig === 'LONG') return 'text-success bg-success/10 border-success';
    if (sig === 'SELL' || sig === 'SHORT') return 'text-destructive bg-destructive/10 border-destructive';
    return 'text-muted-foreground bg-muted/50 border-border';
  };

  const getSignalIcon = (sig: string) => {
    if (sig === 'BUY' || sig === 'LONG') return '📈';
    if (sig === 'SELL' || sig === 'SHORT') return '📉';
    return '⏸️';
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Status da Estratégia
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Strategy Name */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Estratégia Ativa</span>
          <Badge variant="outline" className="font-medium">
            {strategyName}
          </Badge>
        </div>

        {/* Bot Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Bot Status</span>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-success animate-pulse' : 'bg-muted'}`} />
            <span className="text-sm font-medium">
              {isActive ? 'Analisando mercado...' : 'Parado'}
            </span>
          </div>
        </div>

        {/* Latest Analysis */}
        {latestAnalysis && isActive && (
          <div className="p-3 rounded-lg border bg-secondary/30 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {formatDistanceToNow(new Date(latestAnalysis.timestamp), { 
                    addSuffix: true, 
                    locale: ptBR 
                  })}
                </span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {latestAnalysis.pair}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-lg">{getSignalIcon(signal)}</span>
              <Badge className={getSignalColor(signal)}>
                {signal === 'STAY_OUT' ? 'STAY OUT' : signal}
              </Badge>
            </div>

            {notes && signal === 'STAY_OUT' && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground pt-1">
                <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span className="leading-relaxed">{notes}</span>
              </div>
            )}
          </div>
        )}

        {/* Analysis Counter */}
        {isActive && (
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-sm text-muted-foreground">Análises hoje</span>
            <Badge variant="secondary" className="font-mono">
              {analysisCount}
            </Badge>
          </div>
        )}

        {!isActive && (
          <div className="p-3 rounded-lg border border-warning/50 bg-warning/10 text-center">
            <p className="text-sm text-warning">
              Bot parado. Inicie o bot para começar análises.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
