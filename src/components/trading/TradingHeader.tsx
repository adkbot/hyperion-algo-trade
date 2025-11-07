import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Settings, LogOut } from "lucide-react";
import { useState } from "react";
import { SettingsModal } from "./SettingsModal";
import { useUserSettings, useUpdateBotStatus } from "@/hooks/useTradingData";
import { useAuth } from "@/contexts/AuthContext";

interface TradingHeaderProps {
  botStatus: "stopped" | "running" | "paused";
  setBotStatus: (status: "stopped" | "running" | "paused") => void;
}

export const TradingHeader = ({ botStatus, setBotStatus }: TradingHeaderProps) => {
  const [showSettings, setShowSettings] = useState(false);
  const { data: settings } = useUserSettings();
  const updateBotStatus = useUpdateBotStatus();
  const { signOut, user } = useAuth();

  const handleStatusChange = (status: "stopped" | "running" | "paused") => {
    setBotStatus(status);
    updateBotStatus.mutate(status);
  };

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
