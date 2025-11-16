import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

interface ADKStep {
  name: string;
  status: 'completed' | 'pending' | 'waiting';
  data?: string;
}

export const ADKPanel = () => {
  // Dados mockados - serão substituídos por dados reais do backend
  const steps: ADKStep[] = [
    {
      name: "Foundation 15m",
      status: "completed",
      data: "$91,234 (High) / $90,123 (Low)"
    },
    {
      name: "Sweep 15m",
      status: "completed",
      data: "Detectado às 10:15 UTC"
    },
    {
      name: "FVG 15m",
      status: "completed",
      data: "BULLISH ($90,500 - $91,000)"
    },
    {
      name: "50% Retest",
      status: "pending",
      data: "Aguardando ($90,750)"
    },
    {
      name: "Confirmação 1m",
      status: "waiting",
      data: "Pendente"
    }
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'waiting':
        return <XCircle className="w-4 h-4 text-slate-400" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">✅</Badge>;
      case 'pending':
        return <Badge variant="default" className="bg-amber-500/10 text-amber-500 border-amber-500/20">⏳</Badge>;
      case 'waiting':
        return <Badge variant="default" className="bg-slate-500/10 text-slate-400 border-slate-500/20">❌</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <span>📊 ADK Strategy Status</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className="flex items-start gap-3 p-3 rounded-lg border border-border/30 bg-card/50 hover:bg-accent/5 transition-colors"
            >
              <div className="mt-0.5">
                {getStatusIcon(step.status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground">
                    {index + 1}. {step.name}
                  </span>
                  {getStatusBadge(step.status)}
                </div>
                {step.data && (
                  <p className="text-xs text-muted-foreground truncate">
                    {step.data}
                  </p>
                )}
              </div>
            </div>
          ))}
          
          <div className="mt-4 p-3 rounded-lg border border-primary/20 bg-primary/5">
            <p className="text-xs text-muted-foreground mb-1">
              <strong className="text-foreground">Próxima Ação:</strong>
            </p>
            <p className="text-sm text-foreground">
              Esperar preço tocar <span className="font-mono font-bold text-primary">$90,750</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
