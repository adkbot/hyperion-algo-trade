import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { useAgentLogs } from "@/hooks/useTradingData";

export const AgentPanel = () => {
  const { data: logs } = useAgentLogs();

  // Group logs by agent and get the most recent one
  const agentMap = new Map();
  logs?.forEach((log) => {
    if (!agentMap.has(log.agent_name)) {
      agentMap.set(log.agent_name, {
        name: log.agent_name,
        status: log.status.toLowerCase(),
        lastAction: `${log.asset}: ${JSON.stringify(log.data || {})}`,
      });
    }
  });

  const agents = Array.from(agentMap.values());

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "active":
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case "waiting":
        return <Clock className="h-4 w-4 text-warning" />;
      default:
        return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="border-success text-success">Ativo</Badge>;
      case "waiting":
        return <Badge variant="outline" className="border-warning text-warning">Aguardando</Badge>;
      default:
        return <Badge variant="outline">Inativo</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Agentes Especializados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {agents.map((agent, index) => (
          <div key={index} className="p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {getStatusIcon(agent.status)}
                <span className="font-medium text-sm">{agent.name}</span>
              </div>
              {getStatusBadge(agent.status)}
            </div>
            <p className="text-xs text-muted-foreground">{agent.lastAction}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
