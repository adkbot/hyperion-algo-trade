import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Clock, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";

export const AlertPanel = () => {
  const { toast } = useToast();
  const [balance, setBalance] = useState(10000);

  const alerts = [
    {
      type: "entry",
      asset: "BTCUSDT",
      direction: "buy",
      message: "Entrada confirmada! CHoCH + LPSY em M15",
      rr: "1:4.2",
      session: "NY",
      icon: TrendingUp,
      color: "text-success border-success bg-success/10"
    },
    {
      type: "prepare",
      asset: "ETHUSDT",
      direction: "sell",
      message: "Prepare-se! Entrada estimada em 3m 15s",
      rr: "1:3.8",
      session: "Londres",
      icon: Clock,
      color: "text-warning border-warning bg-warning/10"
    }
  ];

  const handleEntryClick = (alert: typeof alerts[0]) => {
    if (balance <= 0) {
      toast({
        title: "Saldo Insuficiente",
        description: "Você não tem saldo disponível para entrar nesta operação.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: `Entrando em ${alert.asset}`,
      description: `Posição ${alert.direction === "buy" ? "COMPRADA" : "VENDIDA"} iniciada com R:R ${alert.rr}`,
    });
  };

  return (
    <div className="space-y-2">
      {alerts.map((alert, index) => {
        const Icon = alert.icon;
        const DirectionIcon = alert.direction === "buy" ? ArrowUp : ArrowDown;
        return (
          <Alert 
            key={index} 
            className={`${alert.color} border-2 cursor-pointer hover:opacity-80 transition-opacity`}
            onClick={() => alert.type === "entry" && handleEntryClick(alert)}
          >
            <Icon className="h-5 w-5" />
            <AlertDescription className="ml-2 flex items-center gap-2 flex-wrap">
              <span className="font-bold">{alert.asset}</span>
              <div className={`flex items-center gap-1 ${alert.direction === "buy" ? "text-profit" : "text-loss"}`}>
                <DirectionIcon className="h-4 w-4" />
                <span className="text-xs font-medium uppercase">{alert.direction}</span>
              </div>
              <span>-</span>
              <span>{alert.message}</span>
              <Badge variant="outline" className="ml-auto">R:R {alert.rr}</Badge>
              <Badge variant="secondary">{alert.session}</Badge>
            </AlertDescription>
          </Alert>
        );
      })}
      {balance <= 0 && (
        <Alert className="border-destructive bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          <AlertDescription className="ml-2 font-medium text-destructive">
            Saldo insuficiente para operar. Deposite fundos para continuar.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};
