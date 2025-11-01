import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";

export const AgentPanel = () => {
  const agents = [
    { name: "RiskManager", status: "active", lastAction: "Validou R:R 1:4.2" },
    { name: "VolumeProfile", status: "active", lastAction: "POC marcado: $67,850" },
    { name: "FibonacciOTE", status: "active", lastAction: "OTE 70.5% identificado" },
    { name: "VWMAFilter", status: "active", lastAction: "VWMA alinhada (Sell)" },
    { name: "CHoCHDetector", status: "waiting", lastAction: "Aguardando CHoCH Micro" },
    { name: "SessionTracker", status: "active", lastAction: "Sessão: NY (Alta Volume)" },
    { name: "Wyckoff", status: "active", lastAction: "LPSY detectado: $68,100" },
    { name: "InvalidationChecker", status: "active", lastAction: "Sem notícias de alto impacto" },
  ];

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
