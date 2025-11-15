import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Settings, LogOut, Zap, Trash2 } from "lucide-react";
import { useState } from "react";
import { SettingsModal } from "./SettingsModal";
import { ClearHistoryButton } from "./ClearHistoryButton";
import { ResetDayButton } from "./ResetDayButton";
import { useUserSettings, useUpdateBotStatus } from "@/hooks/useTradingData";
import { useSetupScalping1Min } from "@/hooks/useSetupScalping1Min";
import { useClearScalpingHistory } from "@/hooks/useClearScalpingHistory";
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
  const { signOut, user } = useAuth();

  const handleStatusChange = (status: "stopped" | "running" | "paused") => {
    setBotStatus(status);
    updateBotStatus.mutate(status);
  };

  const isScalping1Min = settings?.trading_strategy === 'SCALPING_1MIN';

  return (
    <>
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent">
                HFT Crypto Bot
              </h1>
              <div className="flex items-center gap-2 text-sm">
                <div className={`h-2 w-2 rounded-full ${
                  botStatus === "running" ? "bg-success animate-pulse" :
                  botStatus === "paused" ? "bg-warning" : "bg-muted"
                }`} />
                <span className="text-muted-foreground">
                  {botStatus === "running" ? "Executando" :
                   botStatus === "paused" ? "Pausado" : "Parado"}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
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
