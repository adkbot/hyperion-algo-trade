import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const useDailyHistory = () => {
  return useQuery({
    queryKey: ["daily-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_goals")
        .select("*")
        .order("date", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
};

export const DailyHistory = () => {
  const { data: dailyHistory, isLoading } = useDailyHistory();
  
  const totalProfit = dailyHistory?.reduce((sum, day) => sum + (day.total_pnl || 0), 0) || 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Histórico de Metas Diárias</CardTitle>
          <Badge className="bg-profit">Total: +${totalProfit.toFixed(2)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground">
              Carregando histórico...
            </div>
          ) : !dailyHistory || dailyHistory.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              Nenhum histórico disponível ainda
            </div>
          ) : (
            dailyHistory.map((day) => (
              <div key={day.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {day.completed ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      {new Date(day.date).toLocaleDateString('pt-BR', { 
                        day: '2-digit', 
                        month: 'short' 
                      })}
                    </span>
                  </div>
                  <Badge className={day.total_pnl >= 0 ? "bg-profit" : "bg-loss"}>
                    ${Number(day.total_pnl).toFixed(2)}
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Ops:</span>
                    <span className="ml-1 font-bold">{day.total_operations}/45</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Wins:</span>
                    <span className="ml-1 font-bold text-profit">{day.wins}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Losses:</span>
                    <span className="ml-1 font-bold text-loss">{day.losses}/15</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
};