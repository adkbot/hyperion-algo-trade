import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";

interface FoundationStatus {
  session: string;
  high: number | null;
  low: number | null;
  timestamp: string | null;
  valid: boolean;
  timeframe: string;
}

export const FoundationDiagnostic = () => {
  const [foundations, setFoundations] = useState<FoundationStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchFoundations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];

      // Buscar todas as foundations do dia
      const { data, error } = await supabase
        .from('session_foundation')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Agrupar por sessão (pegar a mais recente de cada)
      const foundationMap = new Map<string, FoundationStatus>();
      
      data?.forEach(f => {
        if (!foundationMap.has(f.session)) {
          foundationMap.set(f.session, {
            session: f.session,
            high: f.high,
            low: f.low,
            timestamp: f.timestamp,
            valid: true,
            timeframe: f.timeframe || '5m'
          });
        }
      });

      setFoundations(Array.from(foundationMap.values()));
    } catch (error) {
      console.error('Erro ao buscar foundations:', error);
      toast({
        title: "Erro ao carregar foundations",
        description: "Não foi possível carregar o status das foundations.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFoundations();
    
    // Atualizar a cada 30 segundos
    const interval = setInterval(fetchFoundations, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Detectar sessão atual
  const getCurrentSession = () => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;

    if (timeInMinutes >= 21 * 60 && timeInMinutes < 23 * 60) return 'WELLINGTON';
    if (timeInMinutes >= 23 * 60 || timeInMinutes < 0) return 'SYDNEY';
    if (timeInMinutes >= 0 && timeInMinutes < 1 * 60) return 'TOKYO';
    if (timeInMinutes >= 1 * 60 && timeInMinutes < 1 * 60 + 30) return 'SINGAPORE';
    if (timeInMinutes >= 1 * 60 + 30 && timeInMinutes < 8 * 60) return 'HONG_KONG';
    if (timeInMinutes >= 8 * 60 && timeInMinutes < 14 * 60 + 30) return 'LONDON';
    if (timeInMinutes >= 14 * 60 + 30 && timeInMinutes < 21 * 60) return 'NY';
    
    return 'SYDNEY';
  };

  const currentSession = getCurrentSession();
  const currentFoundation = foundations.find(f => f.session === currentSession);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Foundation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Foundation Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sessão Atual */}
        <div className="p-3 bg-muted rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Sessão Atual: {currentSession}</span>
            {currentFoundation ? (
              <CheckCircle className="h-5 w-5 text-green-500" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            )}
          </div>
          
          {currentFoundation ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>HIGH: {currentFoundation.high?.toFixed(4)}</div>
              <div>LOW: {currentFoundation.low?.toFixed(4)}</div>
              <div>Timeframe: {currentFoundation.timeframe}</div>
              <div>Horário: {new Date(currentFoundation.timestamp!).toLocaleTimeString()}</div>
            </div>
          ) : (
            <p className="text-xs text-yellow-600">Foundation ainda não estabelecida</p>
          )}
        </div>

        {/* Outras Sessões */}
        {foundations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Todas as Sessions (Hoje)</h4>
            <div className="grid gap-2">
              {foundations.map((f) => (
                <div key={f.session} className="flex items-center justify-between p-2 bg-muted/50 rounded text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant={f.session === currentSession ? "default" : "outline"}>
                      {f.session}
                    </Badge>
                    <span className="text-muted-foreground">{f.timeframe}</span>
                  </div>
                  {f.valid ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estatísticas */}
        <div className="pt-3 border-t text-xs text-muted-foreground">
          <div className="flex justify-between">
            <span>Total de Foundations:</span>
            <span className="font-medium">{foundations.length}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Última atualização:</span>
            <span className="font-medium">{new Date().toLocaleTimeString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};