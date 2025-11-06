import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, TrendingUp, TrendingDown, Minus, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const SESSIONS = {
  Oceania: { color: "bg-blue-500", icon: "🌅", time: "00:00-03:00 UTC" },
  Asia: { color: "bg-purple-500", icon: "🌏", time: "03:00-08:00 UTC" },
  London: { color: "bg-orange-500", icon: "🇬🇧", time: "08:00-12:00 UTC" },
  NewYork: { color: "bg-green-500", icon: "🗽", time: "12:00-17:00 UTC" },
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
      const { data, error } = await supabase
        .from('session_history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Detect current session based on UTC time
  const getCurrentSession = () => {
    const now = new Date();
    const utcHour = now.getUTCHours();
    
    if (utcHour >= 0 && utcHour < 3) return 'Oceania';
    if (utcHour >= 3 && utcHour < 8) return 'Asia';
    if (utcHour >= 8 && utcHour < 12) return 'London';
    if (utcHour >= 12 && utcHour < 17) return 'NewYork';
    return 'Oceania';
  };

  const currentSession = getCurrentSession();
  const latestSession = sessionData?.[0];
  const currentPhase = latestSession?.cycle_phase || 'Projection';
  
  const sessionInfo = SESSIONS[currentSession as keyof typeof SESSIONS] || SESSIONS.Oceania;
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

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Ciclo de Sessões</h3>
      </div>

      {/* Current Session */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Sessão Atual</span>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{sessionInfo.time}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${sessionInfo.color} animate-pulse`} />
          <span className="text-2xl">{sessionInfo.icon}</span>
          <span className="text-xl font-bold">{currentSession}</span>
        </div>
      </div>

      {/* Current Phase */}
      <div className="mb-6 p-4 bg-muted/50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Fase do Ciclo</span>
          <Badge className={phaseInfo.color}>{currentPhase}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{phaseInfo.description}</p>
      </div>

      {/* Latest Analyses */}
      {sessionData && sessionData.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-3">Análises Recentes</h4>
          <div className="space-y-3">
            {sessionData.map((analysis, index) => (
              <div
                key={analysis.id}
                className="p-3 bg-muted/30 rounded-lg border border-border/50"
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
        </div>
      )}

      {(!sessionData || sessionData.length === 0) && (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            Aguardando primeira análise...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            O bot precisa estar ativo para gerar análises
          </p>
        </div>
      )}
    </Card>
  );
};