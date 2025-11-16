import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, XCircle, Loader2 } from "lucide-react";
import { useADKProgress } from "@/hooks/useADKProgress";
import { useMemo } from "react";

// Interfaces para os dados JSONB
interface FoundationData {
  isValid: boolean;
  high: number;
  low: number;
  timestamp: string;
}

interface FVG15mData {
  fvgDetected: boolean;
  sweepConfirmed: boolean;
  direction: 'BUY' | 'SELL';
  fvgTop: number;
  fvgBottom: number;
  fvgMidpoint: number;
  timestamp: number;
}

interface RetestData {
  hasRetest: boolean;
  entryReady: boolean;
  touchedMidpoint: boolean;
}

interface Confirmation1mData {
  confirmed: boolean;
  sweepDetected: boolean;
  fvgDetected: boolean;
}

interface EntrySignalData {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  risk?: {
    entry: number;
    stop: number;
    target: number;
    rr_ratio: number;
  };
}

interface ADKState {
  id: string;
  user_id: string;
  asset: string;
  date: string;
  current_phase: string;
  foundation_data: FoundationData | null;
  fvg15m_data: FVG15mData | null;
  retest_data: RetestData | null;
  confirmation1m_data: Confirmation1mData | null;
  entry_signal: EntrySignalData | null;
  next_action: string | null;
  updated_at: string;
  created_at: string;
}

interface ADKStep {
  name: string;
  status: 'completed' | 'pending' | 'waiting';
  data?: string;
}

export const ADKPanel = () => {
  const { data: adkStatesRaw, isLoading } = useADKProgress();
  const adkStates = adkStatesRaw as ADKState[] | undefined;

  // Converter dados do backend para formato do painel
  const steps: ADKStep[] = useMemo(() => {
    if (!adkStates || adkStates.length === 0) {
      return [
        { name: "Foundation 15m", status: "pending", data: "Aguardando primeira vela do dia" },
        { name: "Sweep + FVG 15m", status: "waiting", data: "Aguardando Foundation" },
        { name: "50% Retest", status: "waiting", data: "Aguardando FVG" },
        { name: "Confirmação 1m", status: "waiting", data: "Aguardando Retest" },
        { name: "Entry Signal", status: "waiting", data: "Aguardando Confirmação" }
      ];
    }

    const state = adkStates[0];
    
    return [
      {
        name: "Foundation 15m",
        status: state.foundation_data?.isValid ? 'completed' : 'pending',
        data: state.foundation_data?.isValid 
          ? `$${state.foundation_data.high?.toFixed(2)} (High) / $${state.foundation_data.low?.toFixed(2)} (Low)`
          : 'Aguardando primeira vela do dia'
      },
      {
        name: "Sweep + FVG 15m",
        status: state.fvg15m_data?.fvgDetected && state.fvg15m_data?.sweepConfirmed 
          ? 'completed' 
          : state.foundation_data?.isValid ? 'pending' : 'waiting',
        data: state.fvg15m_data?.fvgDetected
          ? `${state.fvg15m_data.direction} ($${state.fvg15m_data.fvgBottom?.toFixed(2)} - $${state.fvg15m_data.fvgTop?.toFixed(2)})`
          : state.foundation_data?.isValid ? 'Aguardando detecção' : 'Aguardando Foundation'
      },
      {
        name: "50% Retest",
        status: state.retest_data?.entryReady ? 'completed' 
          : state.fvg15m_data?.fvgDetected ? 'pending' : 'waiting',
        data: state.fvg15m_data?.fvgMidpoint
          ? state.retest_data?.entryReady 
            ? `✅ Confirmado em $${state.fvg15m_data.fvgMidpoint?.toFixed(2)}`
            : `Aguardando toque em $${state.fvg15m_data.fvgMidpoint?.toFixed(2)}`
          : 'Aguardando FVG'
      },
      {
        name: "Confirmação 1m",
        status: state.confirmation1m_data?.confirmed ? 'completed' 
          : state.retest_data?.entryReady ? 'pending' : 'waiting',
        data: state.confirmation1m_data?.confirmed 
          ? '✅ Sweep + FVG 1m confirmados' 
          : state.retest_data?.entryReady ? 'Aguardando confirmação' : 'Aguardando Retest'
      },
      {
        name: "Entry Signal",
        status: state.entry_signal?.signal !== 'STAY_OUT' && state.entry_signal?.signal 
          ? 'completed' : 'waiting',
        data: state.entry_signal?.signal !== 'STAY_OUT' && state.entry_signal?.signal
          ? `${state.entry_signal.signal} @ $${state.entry_signal.risk?.entry?.toFixed(2)}`
          : 'Aguardando confirmação'
      }
    ];
  }, [adkStates]);

  const nextAction = useMemo(() => {
    if (!adkStates || adkStates.length === 0) {
      return "Iniciando análise ADK...";
    }
    return adkStates[0]?.next_action || 'Processando...';
  }, [adkStates]);

  const currentAsset = useMemo(() => {
    if (!adkStates || adkStates.length === 0) return null;
    return adkStates[0]?.asset;
  }, [adkStates]);

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
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span>📊 ADK Strategy Status {currentAsset && `- ${currentAsset}`}</span>
          {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
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
              {nextAction}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
