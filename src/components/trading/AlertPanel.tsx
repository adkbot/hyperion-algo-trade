import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowDown, ArrowUp, Clock } from "lucide-react";
import { useEffect, useState } from "react";

export const AlertPanel = () => {
  const [countdown, setCountdown] = useState(180); // 3 minutes in seconds
  const [alertType, setAlertType] = useState<"prepare" | "enter" | null>("prepare");

  useEffect(() => {
    if (countdown <= 0) {
      setAlertType("enter");
      return;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!alertType) return null;

  return (
    <Alert className={`border-2 ${
      alertType === "enter" 
        ? "border-destructive bg-destructive/10" 
        : "border-warning bg-warning/10"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {alertType === "enter" ? (
            <>
              <ArrowDown className="h-6 w-6 text-destructive animate-pulse" />
              <div>
                <AlertDescription className="text-base font-bold text-destructive">
                  ENTRE AGORA - VENDA
                </AlertDescription>
                <p className="text-sm text-muted-foreground mt-1">
                  BTCUSDT - CHoCH Micro confirmado | R:R 1:4.2 | Entry: $67,920
                </p>
              </div>
            </>
          ) : (
            <>
              <Clock className="h-6 w-6 text-warning animate-pulse" />
              <div>
                <AlertDescription className="text-base font-bold text-warning">
                  PREPARE-SE PARA ENTRAR EM {formatTime(countdown)}
                </AlertDescription>
                <p className="text-sm text-muted-foreground mt-1">
                  BTCUSDT - Zona de Valor mitigada | Aguardando CHoCH Micro
                </p>
              </div>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">Direção:</span>
            <span className="ml-2 font-bold text-destructive flex items-center gap-1">
              <ArrowDown className="h-4 w-4" />
              VENDA
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Sessão:</span>
            <span className="ml-2 font-bold">Nova York</span>
          </div>
        </div>
      </div>
    </Alert>
  );
};
