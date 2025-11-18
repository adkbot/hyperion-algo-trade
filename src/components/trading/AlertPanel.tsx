import { Alert, AlertDescription } from "@/components/ui/alert";
import { TrendingUp, Clock, AlertTriangle, ArrowUp, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef } from "react";

export const AlertPanel = () => {
  const { toast } = useToast();

  // Fetch real-time signals from session_history (incluindo First Candle events)
  const { data: signals } = useQuery({
    queryKey: ['active-signals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      // Buscar apenas sinais de HOJE (trading signals + First Candle events)
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', user.id)
        .gte('timestamp', `${today}T00:00:00Z`)
        .or(`signal.neq.STAY_OUT,event_type.in.(FOUNDATION_DETECTED,BREAKOUT,RETEST,ENGULFING)`)
        .gte('confidence_score', 0)
        .order('timestamp', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 3000, // Refresh every 3 seconds
  });

  // Fetch recent STAY_OUT signals for market status
  const { data: stayOutSignals } = useQuery({
    queryKey: ['stay-out-signals'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      
      const today = new Date().toISOString().split('T')[0];
      
      const { data, error } = await supabase
        .from('session_history')
        .select('*')
        .eq('user_id', user.id)
        .eq('signal', 'STAY_OUT')
        .gte('timestamp', `${today}T00:00:00Z`)
        .order('timestamp', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 5000,
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

  // Processar alertas de trading
  const allAlerts = signals?.map((signal: any) => {
    // Trading signals regulares
    if (signal.signal && signal.signal !== 'STAY_OUT') {
      const isLong = signal.signal === 'LONG' || signal.signal === 'BUY';
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
        timestamp: signal.timestamp,
      };
    }
    
    return null;
  }).filter(Boolean) || [];

  // Agrupar por ativo e pegar apenas os 2 mais recentes de cada
  const alertsByAsset = allAlerts.reduce((acc, alert) => {
    if (!acc[alert.asset]) {
      acc[alert.asset] = [];
    }
    acc[alert.asset].push(alert);
    return acc;
  }, {} as Record<string, typeof allAlerts>);

  // Pegar no máximo 2 alertas por ativo (os mais recentes)
  const alerts = Object.values(alertsByAsset)
    .flatMap(assetAlerts => 
      assetAlerts
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 2) // Máximo 2 por ativo
    )
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

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

  // Format relative time
  const formatRelativeTime = (timestamp: string) => {
    const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
    if (seconds < 60) return `há ${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `há ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `há ${hours}h`;
  };

  return (
    <div className="space-y-3">
      {alerts.length === 0 ? (
        <Alert className="bg-secondary/50 border-border">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-muted-foreground text-sm">
            Aguardando sinais de trading...
          </AlertDescription>
        </Alert>
      ) : (
        alerts.map((alert, index) => (
          <Alert 
            key={index} 
            className={`cursor-pointer transition-all hover:shadow-md ${alert.color}`}
            onClick={() => alert.type === "entry" && handleEntryClick(alert)}
          >
            <alert.icon className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {alert.asset}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {alert.session}
                  </Badge>
                </div>
                {alert.direction === "buy" ? (
                  <ArrowUp className="h-3 w-3 text-green-500" />
                ) : (
                  <ArrowDown className="h-3 w-3 text-red-500" />
                )}
              </div>
              
              <p className="text-sm font-medium mb-1">{alert.message}</p>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>RR: {alert.rr}</span>
                <span>Confiança: {(alert.confidence * 100).toFixed(0)}%</span>
              </div>
            </AlertDescription>
          </Alert>
        ))
      )}

      {/* Market Status Section - Show recent STAY_OUT signals */}
      {stayOutSignals && stayOutSignals.length > 0 && (
        <div className="pt-2 border-t border-border/50">
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Status de Mercado
          </p>
          <div className="space-y-1">
            {stayOutSignals.slice(0, 3).map((signal: any, idx: number) => (
              <div 
                key={idx}
                className="flex items-center justify-between text-xs p-2 rounded bg-muted/30"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="font-medium text-foreground">{signal.pair}</span>
                  <span className="text-muted-foreground truncate">
                    {signal.notes || 'Aguardando...'}
                  </span>
                </div>
                <span className="text-muted-foreground ml-2 flex-shrink-0">
                  {formatRelativeTime(signal.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insufficient Balance Warning */}
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
