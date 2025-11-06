import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { useUserSettings, useUpdateSettings } from "@/hooks/useTradingData";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const { data: settings } = useUserSettings();
  const updateSettings = useUpdateSettings();
  
  const [balance, setBalance] = useState(10000);
  const [maxPositions, setMaxPositions] = useState(3);
  const [riskPerTrade, setRiskPerTrade] = useState(0.06);
  const [paperMode, setPaperMode] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  useEffect(() => {
    if (settings) {
      setBalance(settings.balance);
      setMaxPositions(settings.max_positions);
      setRiskPerTrade(settings.risk_per_trade);
      setPaperMode(settings.paper_mode);
      setApiKey(settings.api_key || "");
      setApiSecret(settings.api_secret || "");
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      balance,
      max_positions: maxPositions,
      risk_per_trade: riskPerTrade,
      paper_mode: paperMode,
      api_key: apiKey,
      api_secret: apiSecret,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Configurações da API</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Binance API Key</Label>
            <Input
              id="apiKey"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Sua API Key da Binance"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apiSecret">Binance API Secret</Label>
            <Input
              id="apiSecret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Seu API Secret da Binance"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="balance">Saldo Inicial ($)</Label>
            <Input
              id="balance"
              type="number"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              placeholder="10000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxPositions">Máximo de Posições</Label>
            <Input
              id="maxPositions"
              type="number"
              value={maxPositions}
              onChange={(e) => setMaxPositions(Number(e.target.value))}
              placeholder="3"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="risk">Risco por Trade (%)</Label>
            <Input
              id="risk"
              type="number"
              step="0.01"
              value={riskPerTrade * 100}
              onChange={(e) => setRiskPerTrade(Number(e.target.value) / 100)}
              placeholder="6"
            />
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="paperMode">Modo Paper Trading</Label>
            <Switch
              id="paperMode"
              checked={paperMode}
              onCheckedChange={setPaperMode}
            />
          </div>
          <Button onClick={handleSave} className="w-full" disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
