import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export const BinanceConnectionTest = () => {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const testConnection = async () => {
    setTesting(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-binance-connection');
      
      if (error) throw error;
      
      setResult(data);
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message || 'Erro ao testar conexão'
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          🔌 Teste de Conexão Binance
        </CardTitle>
        <CardDescription>
          Verifique se suas credenciais estão configuradas corretamente
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={testConnection} 
          disabled={testing}
          className="w-full"
        >
          {testing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Testando...
            </>
          ) : (
            'Testar Conexão'
          )}
        </Button>

        {result && (
          <div className="space-y-2">
            {result.success ? (
              <Alert className="border-green-500 bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription className="text-green-500">
                  <div className="font-semibold mb-1">{result.message}</div>
                  {result.mode === 'PAPER' ? (
                    <div className="text-sm space-y-1 mt-2">
                      <div>💰 Balance: ${result.settings?.balance}</div>
                      <div>⚡ Leverage: {result.settings?.leverage}x</div>
                    </div>
                  ) : (
                    <div className="text-sm space-y-1 mt-2">
                      <div>💰 Balance: ${parseFloat(result.account?.totalWalletBalance).toFixed(2)}</div>
                      <div>📊 Available: ${parseFloat(result.account?.availableBalance).toFixed(2)}</div>
                      <div>📈 P&L: ${parseFloat(result.account?.totalUnrealizedProfit).toFixed(2)}</div>
                      <div>🎯 Posições Ativas: {result.account?.positions || 0}</div>
                      <div>✅ Trading: {result.account?.canTrade ? 'Habilitado' : 'Desabilitado'}</div>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="font-semibold mb-1">
                    {result.error || 'Erro na conexão'}
                  </div>
                  {result.code && (
                    <div className="text-sm mt-2">
                      <div>❌ Código: {result.code}</div>
                      {result.code === -2015 && (
                        <div className="mt-2 space-y-1">
                          <div className="font-semibold">⚠️ Possíveis causas:</div>
                          <div>• API Key inválida ou incorreta</div>
                          <div>• Permissão "Enable Futures" não habilitada</div>
                          <div>• Permissão "Enable Trading" não habilitada</div>
                          <div>• IP não está na whitelist (use UNRESTRICTED)</div>
                        </div>
                      )}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <div className="font-semibold mb-1">Configuração necessária na Binance:</div>
            <div>✅ Enable Reading</div>
            <div>✅ Enable Futures</div>
            <div>✅ Enable Trading</div>
            <div>✅ IP Whitelist: UNRESTRICTED</div>
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};
