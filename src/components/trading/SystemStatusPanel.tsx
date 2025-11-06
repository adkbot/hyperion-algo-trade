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
        .single();
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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Status do Sistema
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
          <span className="text-sm text-muted-foreground">Status Geral</span>
          <div className="flex items-center gap-1">
            <StatusIcon className={`h-4 w-4 ${getStatusColor()}`} />
            <span className={`text-xs font-medium ${getStatusColor()}`}>
              {botRunning ? (lastExecution?.status === 'active' ? 'ATIVO' : 'AGUARDANDO') : 'OFFLINE'}
            </span>
          </div>
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
