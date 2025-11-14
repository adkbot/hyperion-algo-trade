import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SESSIONS = {
  OCEANIA: { color: "bg-blue-500", icon: "🌅", time: "00:00-02:30 UTC" },
  ASIA: { color: "bg-purple-500", icon: "🌏", time: "03:00-07:30 UTC" },
  LONDON: { color: "bg-orange-500", icon: "🇬🇧", time: "08:00-12:30 UTC" },
  NY: { color: "bg-green-500", icon: "🗽", time: "13:00-23:30 UTC" },
  TRANSITION: { color: "bg-gray-500", icon: "⏸️", time: "Buffer 30min" },
};

const PHASES = {
  Projection: { color: "bg-blue-600", description: "Identificando tendência inicial" },
  Consolidation: { color: "bg-yellow-600", description: "Acumulação e range" },
  Execution: { color: "bg-red-600", description: "Execução de operações" },
};

export const SessionCyclePanel = () => {
  // Fetch latest session data
  const { data: sessionData } = useQuery({
    queryKey: ['session-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', user.id)
        .order('timestamp', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  // Fetch First Candle Rule status
  const { data: firstCandleStatus } = useQuery({
    queryKey: ['first-candle-status'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      
      // Buscar foundation do dia
      const { data: foundation } = await supabase
        .from('session_foundation')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Buscar eventos recentes
      const { data: events } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', user.id)
        .in('event_type', ['FOUNDATION_DETECTED', 'BREAKOUT', 'RETEST', 'ENGULFING'])
        .gte('timestamp', `${today}T00:00:00Z`)
        .order('timestamp', { ascending: false })
        .limit(5);
      
      return { foundation, events: events || [] };
    },
    refetchInterval: 3000,
  });

  // Detect current session based on UTC time
  const getCurrentSession = () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    const utcDecimal = utcHour + (utcMinutes / 60);
    
    // Buffers de transição (30min antes de cada sessão)
    if ((utcDecimal >= 2.5 && utcDecimal < 3) ||
        (utcDecimal >= 7.5 && utcDecimal < 8) ||
        (utcDecimal >= 12.5 && utcDecimal < 13) ||
        (utcDecimal >= 23.5)) {
      return 'TRANSITION';
    }
    
    // Sessões ativas (alinhado com backend) - nomes padronizados
    if (utcDecimal >= 0 && utcDecimal < 2.5) return 'OCEANIA';
    if (utcDecimal >= 3 && utcDecimal < 7.5) return 'ASIA';
    if (utcDecimal >= 8 && utcDecimal < 12.5) return 'LONDON';
    if (utcDecimal >= 13 && utcDecimal < 23.5) return 'NY';
    
    return 'OCEANIA'; // Fallback
  };

  const currentSession = getCurrentSession();
  const latestSession = sessionData?.[0];
  const currentPhase = latestSession?.cycle_phase || 'Projection';
  
  const sessionInfo = SESSIONS[currentSession as keyof typeof SESSIONS] || SESSIONS.OCEANIA;
  const phaseInfo = PHASES[currentPhase as keyof typeof PHASES] || PHASES.Projection;

  const getDirectionIcon = (direction: string) => {
    if (direction === 'LONG') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (direction === 'SHORT') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return <Minus className="h-4 w-4 text-gray-500" />;
  };

  const getSignalBadge = (signal: string) => {
    if (signal === 'LONG') return <Badge className="bg-green-600">LONG</Badge>;
    if (signal === 'SHORT') return <Badge className="bg-red-600">SHORT</Badge>;
    return <Badge variant="outline">STAY OUT</Badge>;
  };

  // Get latest First Candle events
  const latestFoundation = firstCandleStatus?.events?.find(e => e.event_type === 'FOUNDATION_DETECTED');
  const latestBreakout = firstCandleStatus?.events?.find(e => e.event_type === 'BREAKOUT');
  const latestRetest = firstCandleStatus?.events?.find(e => e.event_type === 'RETEST');
  const latestEngulfing = firstCandleStatus?.events?.find(e => e.event_type === 'ENGULFING');

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Ciclo de Sessões</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* First Candle Rule Status */}
        {(latestFoundation || latestBreakout || latestRetest || latestEngulfing) && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold text-primary">🎯 First Candle Rule</span>
            </div>
            <div className="space-y-1.5 text-xs">
              {latestFoundation && (
                <div className="flex items-center gap-2">
                  <span className="text-green-500">🏗️</span>
                  <span className="text-muted-foreground">
                    Foundation: H {(latestFoundation.event_data as any)?.high?.toFixed(2) || 'N/A'} | L {(latestFoundation.event_data as any)?.low?.toFixed(2) || 'N/A'}
                  </span>
                </div>
              )}
              {latestBreakout && (
                <div className="flex items-center gap-2">
                  <span className="text-orange-500">⚡</span>
                  <span className="text-muted-foreground">
                    Breakout {latestBreakout.direction} @ {(latestBreakout.event_data as any)?.price?.toFixed(2) || 'N/A'}
                  </span>
                </div>
              )}
              {latestRetest && (
                <div className="flex items-center gap-2">
                  <span className="text-blue-500">👀</span>
                  <span className="text-muted-foreground">Aguardando reteste confirmado...</span>
                </div>
              )}
              {latestEngulfing && (
                <div className="flex items-center gap-2">
                  <span className="text-green-500">🚀</span>
                  <span className="font-semibold text-green-500">ENTRADA CONFIRMADA!</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Current Session */}
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Sessão Atual</span>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{sessionInfo.time}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${sessionInfo.color} animate-pulse`} />
            <span className="text-lg">{sessionInfo.icon}</span>
            <span className="text-base font-bold">{currentSession}</span>
          </div>
        </div>

        {/* Current Phase */}
        <div className="p-3 rounded-lg bg-secondary/50 border border-border">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">Fase do Ciclo</span>
            <Badge className={phaseInfo.color}>{currentPhase}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{phaseInfo.description}</p>
        </div>

        {/* Latest Analyses */}
        {sessionData && sessionData.length > 0 ? (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Análises Recentes</h4>
            {sessionData.map((analysis) => (
              <div
                key={analysis.id}
                className="p-3 rounded-lg bg-secondary/50 border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{analysis.pair}</span>
                    {getDirectionIcon(analysis.direction)}
                  </div>
                  {getSignalBadge(analysis.signal)}
                </div>
                
                {analysis.confidence_score && (
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">Confiança:</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          analysis.confidence_score > 0.7 ? 'bg-green-500' : 
                          analysis.confidence_score > 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${analysis.confidence_score * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium">
                      {(analysis.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                )}

                {analysis.volume_factor && (
                  <div className="text-xs text-muted-foreground mb-1">
                    Volume: {analysis.volume_factor.toFixed(2)}x
                  </div>
                )}

                {analysis.notes && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {analysis.notes}
                  </p>
                )}

                {analysis.c1_direction && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">
                      C1 Direction: <span className="font-medium">{analysis.c1_direction}</span>
                    </span>
                  </div>
                )}

                {analysis.range_high && analysis.range_low && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <span className="text-xs text-muted-foreground">
                      Range Londres: {analysis.range_low.toFixed(2)} - {analysis.range_high.toFixed(2)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Aguardando primeira análise...
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              O bot precisa estar ativo para gerar análises
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};