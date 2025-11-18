import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useState, useEffect } from "react";
import { useUserSettings, useUpdateSettings } from "@/hooks/useTradingData";
import { useSetupScalping1Min } from "@/hooks/useSetupScalping1Min";
import { useClearOldHistory } from "@/hooks/useClearOldHistory";
import { useToast } from "@/hooks/use-toast";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsModal = ({ open, onOpenChange }: SettingsModalProps) => {
  const { data: settings } = useUserSettings();
  const updateSettings = useUpdateSettings();
  const setupScalping = useSetupScalping1Min();
  const clearOldHistory = useClearOldHistory();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState(10000);
  const [maxPositions, setMaxPositions] = useState(3);
  const [riskPerTrade, setRiskPerTrade] = useState(0.06);
  const [paperMode, setPaperMode] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [leverage, setLeverage] = useState(20);
  const [profitTarget, setProfitTarget] = useState(100);
  const [tradingStrategy, setTradingStrategy] = useState<'SWEEP_LIQUIDITY' | 'SCALPING_1MIN' | 'FVG_MULTI_TF' | 'FIRST_CANDLE_ADK'>('SWEEP_LIQUIDITY');

  useEffect(() => {
    if (settings) {
      setBalance(settings.balance);
      setMaxPositions(settings.max_positions);
      setRiskPerTrade(settings.risk_per_trade);
      setPaperMode(settings.paper_mode);
      setApiKey(settings.api_key || "");
      setApiSecret(settings.api_secret || "");
      setLeverage(settings.leverage || 20);
      setProfitTarget(settings.profit_target_percent || 100);
      setTradingStrategy(settings.trading_strategy as 'SWEEP_LIQUIDITY' | 'SCALPING_1MIN' | 'FVG_MULTI_TF' | 'FIRST_CANDLE_ADK' || 'SWEEP_LIQUIDITY');
    }
  }, [settings]);

  const handleSave = () => {
    // Validate balance
    if (balance <= 0) {
      toast({
        title: "Saldo Inválido",
        description: "O saldo deve ser maior que zero para operar.",
        variant: "destructive",
      });
      return;
    }

    if (balance < 10) {
      toast({
        title: "Saldo Insuficiente",
        description: "O saldo mínimo recomendado é de $10 USD para operar com segurança.",
        variant: "destructive",
      });
      return;
    }

    // Validate API keys if switching to real mode
    if (!paperMode && (!apiKey || !apiSecret)) {
      toast({
        title: "API Keys Obrigatórias",
        description: "Para operar em modo REAL, você precisa configurar suas API Keys da Binance.",
        variant: "destructive",
      });
      return;
    }

    // Basic API key format validation (Binance keys are typically 64 characters)
    if (apiKey && apiKey.length < 20) {
      toast({
        title: "API Key Inválida",
        description: "A API Key parece estar incorreta. Verifique e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    if (apiSecret && apiSecret.length < 20) {
      toast({
        title: "API Secret Inválida",
        description: "A API Secret parece estar incorreta. Verifique e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    updateSettings.mutate({
      balance,
      max_positions: maxPositions,
      risk_per_trade: riskPerTrade,
      paper_mode: paperMode,
      api_key: apiKey || null,
      api_secret: apiSecret || null,
      leverage,
      profit_target_percent: profitTarget,
      trading_strategy: tradingStrategy,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurações da API</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="apiKey">Binance API Key</Label>
            <Input
              id="apiKey"
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Sua API Key da Binance"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="apiSecret">Binance API Secret</Label>
            <Input
              id="apiSecret"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              placeholder="Seu API Secret da Binance"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="balance">Saldo Inicial ($)</Label>
            <Input
              id="balance"
              type="number"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              placeholder="10000"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="maxPositions">Máximo de Posições</Label>
            <Input
              id="maxPositions"
              type="number"
              value={maxPositions}
              onChange={(e) => setMaxPositions(Number(e.target.value))}
              placeholder="3"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="risk">Risco por Trade (%)</Label>
            <Input
              id="risk"
              type="number"
              step="0.01"
              min="0.01"
              max="100"
              value={riskPerTrade * 100}
              onChange={(e) => setRiskPerTrade(Number(e.target.value) / 100)}
              placeholder="Digite o percentual de risco (ex: 6)"
            />
            <p className="text-xs text-muted-foreground">
              Valor livre - Defina o percentual de risco que deseja assumir por trade
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="leverage">Alavancagem</Label>
            <Input
              id="leverage"
              type="number"
              min="1"
              max="125"
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Recomendado: 20x
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="profitTarget">Meta de Lucro por Trade (%)</Label>
            <Input
              id="profitTarget"
              type="number"
              min="10"
              max="200"
              value={profitTarget}
              onChange={(e) => setProfitTarget(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Ex: 100% = dobrar saldo em cada trade
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="tradingStrategy">Estratégia de Trading</Label>
            <select
              id="tradingStrategy"
              value={tradingStrategy}
              onChange={(e) => setTradingStrategy(e.target.value as 'SWEEP_LIQUIDITY' | 'SCALPING_1MIN' | 'FVG_MULTI_TF' | 'FIRST_CANDLE_ADK')}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="SWEEP_LIQUIDITY">Sweep de Liquidez + IA</option>
              <option value="SCALPING_1MIN">Scalping 1 Minuto (Mecânico)</option>
              <option value="FVG_MULTI_TF">📈 FVG Multi-Timeframe (15m/1m)</option>
              <option value="FIRST_CANDLE_ADK">📊 First Candle ADK (Multi-TF)</option>
            </select>
            <p className="text-xs text-muted-foreground">
              {tradingStrategy === 'FIRST_CANDLE_ADK'
                ? '🎯 ADK: Foundation 15m (dia) → Sweep 15m → FVG 15m → Retest 50% → Confirmação 1m. R:R 2.5:1. Alta precisão multi-timeframe.'
                : tradingStrategy === 'FVG_MULTI_TF'
                ? '📈 FVG Multi-TF: Análise 15m (tendência + FVG qualidade) → Execução 1m (Liquidity Sweep + BOS/MSS + Entrada CE). RR ≥2:1.'
                : tradingStrategy === 'SCALPING_1MIN' 
                ? '🎯 Mecânica 100% FVG + engolfo. R:R fixo 3:1. Máximo 1 trade por sessão.'
                : '📊 Sweep de liquidez + confirmação M1 + validação IA.'}
            </p>
          </div>
          <div className="flex items-center justify-between space-x-2">
            <Label htmlFor="paperMode">Modo Paper Trading</Label>
            <Switch
              id="paperMode"
              checked={paperMode}
              onCheckedChange={setPaperMode}
            />
          </div>
          <div className="space-y-2">
            <Button onClick={handleSave} className="w-full" disabled={updateSettings.isPending}>
              {updateSettings.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
            
            {tradingStrategy === 'SCALPING_1MIN' && (
              <Button 
                onClick={() => {
                  setupScalping.mutate();
                  onOpenChange(false);
                }}
                className="w-full" 
                variant="outline"
                disabled={setupScalping.isPending}
              >
                {setupScalping.isPending ? "Ativando..." : "🎯 Ativar Scalping 1 Min Agora"}
              </Button>
            )}

            <Button 
              onClick={() => {
                clearOldHistory.mutate(false);
                onOpenChange(false);
              }}
              className="w-full" 
              variant="outline"
              disabled={clearOldHistory.isPending}
            >
              {clearOldHistory.isPending ? "Limpando..." : "🧹 Limpar Histórico Antigo"}
            </Button>

            <Button 
              onClick={() => {
                if (confirm("⚠️ ATENÇÃO: Isso vai deletar TODOS os eventos de session_history, incluindo os de hoje. Tem certeza?")) {
                  clearOldHistory.mutate(true);
                  onOpenChange(false);
                }
              }}
              className="w-full" 
              variant="destructive"
              disabled={clearOldHistory.isPending}
            >
              {clearOldHistory.isPending ? "Limpando..." : "🗑️ Limpar TUDO (incluindo hoje)"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
