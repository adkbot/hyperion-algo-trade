import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";

export const SystemStatusPanel = () => {
  const { data: settings } = useQuery({
    queryKey: ['system-status-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('user_settings').select('*').single();
      return data;
    },
    refetchInterval: 5000,
  });

  const { data: lastExecution } = useQuery({
    queryKey: ['last-orchestrator-execution'],
    queryFn: async () => {
      const { data } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('agent_name', 'Cycle Orchestrator')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const botRunning = settings?.bot_status === 'running';
  const lastRun = lastExecution?.created_at 
    ? new Date(lastExecution.created_at).toLocaleTimeString('pt-BR')
    : 'Nunca';

  const getStatusColor = () => {
    if (!botRunning) return 'text-muted-foreground';
    if (lastExecution?.status === 'active') return 'text-success';
    return 'text-warning';
  };

  const getStatusIcon = () => {
    if (!botRunning) return AlertCircle;
    if (lastExecution?.status === 'active') return CheckCircle2;
    return Clock;
  };

  const StatusIcon = getStatusIcon();

  const isBuffer = lastExecution?.data && 
    ((lastExecution.data as any)?.phase === 'BUFFER FINAL' || 
     (lastExecution.data as any)?.phase === 'BUFFER INICIAL');
  
  const canTrade = botRunning && !isBuffer;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Status do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* INDICADOR PRINCIPAL DE OPERAÇÃO */}
        <div className="p-3 rounded-lg border-2" style={{
          borderColor: canTrade ? 'hsl(var(--success))' : isBuffer ? 'hsl(var(--warning))' : 'hsl(var(--muted))',
          backgroundColor: canTrade ? 'hsl(var(--success) / 0.1)' : isBuffer ? 'hsl(var(--warning) / 0.1)' : 'hsl(var(--muted) / 0.1)'
        }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Status de Operação</span>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-pulse`} style={{
                backgroundColor: canTrade ? 'hsl(var(--success))' : isBuffer ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))'
              }} />
              <span className="text-xs font-bold" style={{
                color: canTrade ? 'hsl(var(--success))' : isBuffer ? 'hsl(var(--warning))' : 'hsl(var(--muted-foreground))'
              }}>
                {canTrade ? '🟢 OPERANDO' : isBuffer ? '🟡 BUFFER' : '⚫ PARADO'}
              </span>
            </div>
          </div>
          {isBuffer && (
            <p className="text-xs" style={{ color: 'hsl(var(--warning))' }}>
              ⏳ Período de transição - Sem execução de trades
            </p>
          )}
          {canTrade && (
            <p className="text-xs text-success">
              ✅ Sistema ativo - Pode executar trades
            </p>
          )}
          {!botRunning && (
            <p className="text-xs text-muted-foreground">
              Bot desligado - Clique em "Iniciar Bot" para operar
            </p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Orchestrator</span>
          <Badge variant={botRunning ? "default" : "secondary"}>
            {botRunning ? "RODANDO" : "PARADO"}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Última Execução</span>
          <span className="text-xs font-mono">{lastRun}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Modo</span>
          <Badge variant="outline">
            {settings?.paper_mode ? "PAPER" : "REAL"}
          </Badge>
        </div>

        {botRunning && lastExecution?.data && (
          <div className="pt-2 border-t">
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Sessão: <span className="text-foreground font-medium">{(lastExecution.data as any)?.session || 'N/A'}</span></div>
              <div>Fase: <span className="text-foreground font-medium">{(lastExecution.data as any)?.phase || 'N/A'}</span></div>
              <div>Sinal: <span className="text-foreground font-medium">{(lastExecution.data as any)?.signal || 'N/A'}</span></div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
