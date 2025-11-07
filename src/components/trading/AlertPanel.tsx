import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Clock, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const AlertPanel = () => {
  const { toast } = useToast();

  // Fetch real-time signals from session_history
  const { data: signals } = useQuery({
    queryKey: ['active-signals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data, error } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', user.id)
        .neq('signal', 'STAY_OUT')
        .gte('confidence_score', 0.7)
        .order('timestamp', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  // Fetch user settings for balance check
  const { data: settings } = useQuery({
    queryKey: ['user-settings-alert'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const { data } = await supabase
        .from('user_settings')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();
      return data;
    },
  });

  const alerts = signals?.map(signal => {
    const isLong = signal.signal === 'LONG';
    const isEntry = signal.confidence_score && signal.confidence_score >= 0.8;
    const risk = signal.risk as any;
    
    return {
      type: isEntry ? "entry" : "prepare",
      asset: signal.pair,
      direction: isLong ? "buy" : "sell",
      message: isEntry 
        ? `Entrada confirmada! ${signal.confirmation}` 
        : `Prepare-se! ${signal.notes}`,
      rr: risk?.rr_ratio ? `1:${risk.rr_ratio.toFixed(1)}` : "N/A",
      session: signal.session,
      icon: isEntry ? TrendingUp : Clock,
      color: isEntry 
        ? "text-success border-success bg-success/10"
        : "text-warning border-warning bg-warning/10",
      confidence: signal.confidence_score || 0,
    };
  }) || [];

  const handleEntryClick = (alert: any) => {
    if (!settings || settings.balance <= 0) {
      toast({
        title: "Saldo Insuficiente",
        description: "Você não tem saldo disponível para entrar nesta operação.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: `Sinal em ${alert.asset}`,
      description: `${alert.direction === "buy" ? "COMPRA" : "VENDA"} | Confiança: ${(alert.confidence * 100).toFixed(0)}% | R:R ${alert.rr}`,
    });
  };

  return (
    <div className="space-y-2">
      {alerts.length === 0 ? (
        <Alert className="border-muted">
          <Clock className="h-5 w-5" />
          <AlertDescription className="ml-2">
            Aguardando sinais do Orchestrator... Nenhum sinal ativo no momento.
          </AlertDescription>
        </Alert>
      ) : (
        alerts.map((alert, index) => {
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
                <span className="text-sm">{alert.message}</span>
                <Badge variant="outline" className="ml-auto">R:R {alert.rr}</Badge>
                <Badge variant="secondary">{alert.session}</Badge>
              </AlertDescription>
            </Alert>
          );
        })
      )}
      {settings && settings.balance <= 0 && (
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
