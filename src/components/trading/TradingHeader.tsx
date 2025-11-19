import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Pause, Square, Settings, LogOut, Zap, Trash2, XCircle, MoreVertical } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { SettingsModal } from "./SettingsModal";
import { ClearHistoryButton } from "./ClearHistoryButton";
import { ResetDayButton } from "./ResetDayButton";
import { useUserSettings, useUpdateBotStatus } from "@/hooks/useTradingData";
import { useSetupScalping1Min } from "@/hooks/useSetupScalping1Min";
import { useClearScalpingHistory } from "@/hooks/useClearScalpingHistory";
import { useCancelAllOrders } from "@/hooks/useCancelAllOrders";
import { useAuth } from "@/contexts/AuthContext";

interface TradingHeaderProps {
  botStatus: "stopped" | "running" | "paused";
  setBotStatus: (status: "stopped" | "running" | "paused") => void;
}

export const TradingHeader = ({ botStatus, setBotStatus }: TradingHeaderProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const { data: settings } = useUserSettings();
  const updateBotStatus = useUpdateBotStatus();
  const setupScalping = useSetupScalping1Min();
  const clearHistory = useClearScalpingHistory();
  const cancelAllOrders = useCancelAllOrders();
  const { signOut, user } = useAuth();

  const handleStatusChange = (status: "stopped" | "running" | "paused") => {
    setBotStatus(status);
    updateBotStatus.mutate(status);
  };

  const isScalping1Min = settings?.trading_strategy === 'SCALPING_1MIN';

  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
              <h1 className="text-lg sm:text-2xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                HFT Crypto Bot
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                <div className="flex items-center gap-1 sm:gap-2">
                  <div className={`h-2 w-2 rounded-full ${
                    botStatus === "running" ? "bg-success animate-pulse" :
                    botStatus === "paused" ? "bg-warning" : "bg-muted"
                  }`} />
                  <span className="text-muted-foreground hidden sm:inline">
                    {botStatus === "running" ? "Executando" :
                     botStatus === "paused" ? "Pausado" : "Parado"}
                  </span>
                </div>
                
                {/* Strategy Badge */}
                {settings?.trading_strategy && (
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${
                      settings.trading_strategy === 'FVG_MULTI_TF' ? 'bg-blue-500/10 text-blue-500 border-blue-500/30' :
                      settings.trading_strategy === 'SCALPING_1MIN' ? 'bg-green-500/10 text-green-500 border-green-500/30' :
                      settings.trading_strategy === 'SWEEP_LIQUIDITY' ? 'bg-purple-500/10 text-purple-500 border-purple-500/30' :
                      'bg-primary/10 text-primary border-primary/30'
                    }`}
                  >
                    <span className="hidden sm:inline">📊 </span>
                    {
                      settings.trading_strategy === 'FVG_MULTI_TF' ? 'FVG' :
                      settings.trading_strategy === 'SCALPING_1MIN' ? 'Scalp' :
                      settings.trading_strategy === 'SWEEP_LIQUIDITY' ? 'Sweep' :
                      settings.trading_strategy === 'ADK' ? 'ADK' :
                      settings.trading_strategy
                    }
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-1 sm:gap-2 w-full sm:w-auto">
              <Button
                onClick={() => cancelAllOrders.mutate(undefined)}
                disabled={cancelAllOrders.isPending}
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
              >
                <XCircle className="h-4 w-4 mr-2" />
                {cancelAllOrders.isPending ? "Cancelando..." : "❌ Cancelar Ordens Binance"}
              </Button>
              
              {!isScalping1Min && (
                <Button
                  onClick={() => setupScalping.mutate()}
                  disabled={setupScalping.isPending}
                  variant="default"
                  className="bg-gradient-to-r from-primary to-success hover:opacity-90"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {setupScalping.isPending ? "Ativando..." : "🎯 Ativar Scalping 1 Min"}
                </Button>
              )}
              
              {isScalping1Min && (
                <Button
                  onClick={() => clearHistory.mutate()}
                  disabled={clearHistory.isPending}
                  variant="outline"
                  className="border-warning text-warning hover:bg-warning/10"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {clearHistory.isPending ? "Limpando..." : "🧹 Limpar Logs Antigos"}
                </Button>
              )}
              
              {botStatus === "stopped" && (
                <Button
                  onClick={() => handleStatusChange("running")}
                  className="bg-success hover:bg-success/90"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Bot
                </Button>
              )}
              
              {botStatus === "running" && (
                <>
                  <Button
                    onClick={() => handleStatusChange("paused")}
                    variant="outline"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar
                  </Button>
                  <Button
                    onClick={() => handleStatusChange("stopped")}
                    variant="destructive"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Parar
                  </Button>
                </>
              )}
              
              {botStatus === "paused" && (
                <>
                  <Button
                    onClick={() => handleStatusChange("running")}
                    className="bg-success hover:bg-success/90"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Retomar
                  </Button>
                  <Button
                    onClick={() => handleStatusChange("stopped")}
                    variant="destructive"
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Parar
                  </Button>
                </>
              )}
              
              <ResetDayButton />
              
              <ClearHistoryButton />
              
              <Button
                onClick={() => setShowSettings(true)}
                variant="outline"
                size="icon"
              >
                <Settings className="h-4 w-4" />
              </Button>
              
              <Button
                onClick={signOut}
                variant="ghost"
                size="icon"
                title="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>
      
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
};
