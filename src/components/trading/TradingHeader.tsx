import { Button } from "@/components/ui/button";
import { Play, Pause, Square, Settings } from "lucide-react";
import { useState } from "react";
import { SettingsModal } from "./SettingsModal";

interface TradingHeaderProps {
  botStatus: "stopped" | "running" | "paused";
  setBotStatus: (status: "stopped" | "running" | "paused") => void;
}

export const TradingHeader = ({ botStatus, setBotStatus }: TradingHeaderProps) => {
  const [showSettings, setShowSettings] = useState(false);

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
                  onClick={() => setBotStatus("running")}
                  className="bg-success hover:bg-success/90"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Iniciar Bot
                </Button>
              )}
              
              {botStatus === "running" && (
                <>
                  <Button
                    onClick={() => setBotStatus("paused")}
                    variant="outline"
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Pausar
                  </Button>
                  <Button
                    onClick={() => setBotStatus("stopped")}
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
                    onClick={() => setBotStatus("running")}
                    className="bg-success hover:bg-success/90"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Retomar
                  </Button>
                  <Button
                    onClick={() => setBotStatus("stopped")}
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
            </div>
          </div>
        </div>
      </header>
      
      <SettingsModal open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
};
