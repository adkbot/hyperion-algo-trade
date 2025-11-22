import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, TrendingUp, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

export const SignalsDiagnosticPanel = () => {
  const { toast } = useToast();
  const [retrying, setRetrying] = useState(false);

  const { data: diagnostics, refetch } = useQuery({
    queryKey: ['signals-diagnostics'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Buscar sinais pendentes
      const { data: pending } = await supabase
        .from('pending_signals')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(5);

      // Buscar últimos erros de execução
      const { data: errors } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('user_id', user.id)
        .eq('agent_name', 'EXECUTE_PENDING_SIGNALS')
        .in('status', ['ERROR', 'REJECTED'])
        .order('created_at', { ascending: false })
        .limit(5);

      // Buscar configurações
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Buscar posições ativas
      const { data: positions } = await supabase
        .from('active_positions')
        .select('*')
        .eq('user_id', user.id);

      return {
        pending: pending || [],
        errors: errors || [],
        settings,
        positions: positions || []
      };
    },
    refetchInterval: 10000
  });

  const retryPendingSignals = async () => {
    setRetrying(true);
    try {
      const { data, error } = await supabase.functions.invoke('execute-pending-signals');
      
      if (error) throw error;
      
      toast({
        title: '✅ Execução Concluída',
        description: `${data.executed} executado(s), ${data.rejected} rejeitado(s)`,
      });
      
      refetch();
    } catch (error: any) {
      toast({
        title: '❌ Erro',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setRetrying(false);
    }
  };

  const getErrorBadge = (reason: string) => {
    const badges: Record<string, { label: string; variant: 'destructive' | 'secondary' | 'default' }> = {
      'BINANCE_INVALID_API_KEY': { label: 'API Key Inválida', variant: 'destructive' },
      'BINANCE_MISSING_FUTURES_PERMISSION': { label: 'Sem Permissão Futures', variant: 'destructive' },
      'BINANCE_IP_NOT_ALLOWED': { label: 'IP Bloqueado', variant: 'destructive' },
      'ACTIVE_POSITION_EXISTS': { label: 'Posição Ativa', variant: 'secondary' },
      'MAX_POSITIONS_REACHED': { label: 'Limite de Posições', variant: 'secondary' },
      'PRICE_DEVIATION_TOO_HIGH': { label: 'Preço Fora da Tolerância', variant: 'secondary' },
      'BINANCE_ORDER_ERROR': { label: 'Erro na Binance', variant: 'destructive' },
      'BINANCE_ORDER_EXCEPTION': { label: 'Exceção na Ordem', variant: 'destructive' }
    };

    const badge = badges[reason] || { label: reason, variant: 'default' as const };
    return <Badge variant={badge.variant}>{badge.label}</Badge>;
  };

  if (!diagnostics) return null;

  const hasApiErrors = diagnostics.errors.some(e => {
    const data = e.data as any;
    return data?.reason?.includes('BINANCE') || data?.reason?.includes('API');
  });

  const hasPositionLimit = diagnostics.errors.some(e => {
    const data = e.data as any;
    return data?.reason === 'MAX_POSITIONS_REACHED' || 
           data?.reason === 'ACTIVE_POSITION_EXISTS';
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>📊 Diagnóstico de Sinais</span>
          <Button
            size="sm"
            variant="outline"
            onClick={retryPendingSignals}
            disabled={retrying || diagnostics.pending.length === 0}
          >
            {retrying ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </CardTitle>
        <CardDescription>
          Status de execução e problemas detectados
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Alertas Críticos */}
        {hasApiErrors && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold">⚠️ Erro de Conexão com Binance</div>
              <div className="text-sm mt-1">
                Suas credenciais da Binance estão com problema. Verifique:
              </div>
              <div className="text-sm mt-1 space-y-1">
                <div>• API Key e Secret estão corretos</div>
                <div>• Permissões "Enable Futures" e "Enable Trading" habilitadas</div>
                <div>• IP Whitelist configurado como UNRESTRICTED</div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {hasPositionLimit && diagnostics.settings?.single_position_mode && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-semibold">🔒 Modo Single Position Ativo</div>
              <div className="text-sm mt-1">
                Você tem {diagnostics.positions.length} posição ativa e o modo single position está habilitado.
                Feche a posição atual ou desabilite o modo nas configurações.
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Estatísticas */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-yellow-500">
              {diagnostics.pending.length}
            </div>
            <div className="text-xs text-muted-foreground">Pendentes</div>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-500">
              {diagnostics.errors.length}
            </div>
            <div className="text-xs text-muted-foreground">Erros Recentes</div>
          </div>
          <div className="bg-muted/50 p-3 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-500">
              {diagnostics.positions.length}
            </div>
            <div className="text-xs text-muted-foreground">Posições Ativas</div>
          </div>
        </div>

        {/* Últimos Erros */}
        {diagnostics.errors.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">🔴 Últimos Erros:</div>
            {diagnostics.errors.slice(0, 3).map((error) => {
              const errorData = error.data as any;
              return (
                <div key={error.id} className="bg-muted/30 p-2 rounded text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono">{error.asset}</span>
                    {getErrorBadge(errorData?.reason || 'UNKNOWN')}
                  </div>
                  <div className="text-muted-foreground">
                    {errorData?.details || 'Sem detalhes'}
                  </div>
                  <div className="text-muted-foreground">
                    {new Date(error.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sinais Pendentes */}
        {diagnostics.pending.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-semibold">⏳ Sinais Aguardando:</div>
            {diagnostics.pending.slice(0, 3).map((signal) => (
              <div key={signal.id} className="bg-muted/30 p-2 rounded text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{signal.asset}</span>
                  <Badge variant={signal.direction === 'BUY' ? 'default' : 'secondary'}>
                    {signal.direction}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  <span>Entry: ${signal.entry_price.toFixed(4)}</span>
                  <span>•</span>
                  <span>Confiança: {signal.confidence_score}%</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Expira: {new Date(signal.expires_at).toLocaleTimeString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {diagnostics.pending.length === 0 && diagnostics.errors.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              ✅ Nenhum problema detectado no momento
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
