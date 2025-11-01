import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle } from "lucide-react";

export const DailyHistory = () => {
  const dailyHistory = [
    {
      date: "2025-01-15",
      operations: 45,
      wins: 34,
      losses: 11,
      profit: 1250.75,
      goalAchieved: true
    },
    {
      date: "2025-01-14",
      operations: 42,
      wins: 31,
      losses: 11,
      profit: 980.50,
      goalAchieved: false
    },
    {
      date: "2025-01-13",
      operations: 45,
      wins: 36,
      losses: 9,
      profit: 1450.25,
      goalAchieved: true
    },
    {
      date: "2025-01-12",
      operations: 38,
      wins: 29,
      losses: 9,
      profit: 875.00,
      goalAchieved: false
    }
  ];

  const totalProfit = dailyHistory.reduce((sum, day) => sum + day.profit, 0);

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
          {dailyHistory.map((day, index) => (
            <div key={index} className="p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {day.goalAchieved ? (
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
                <Badge className={day.profit >= 0 ? "bg-profit" : "bg-loss"}>
                  ${day.profit.toFixed(2)}
                </Badge>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Ops:</span>
                  <span className="ml-1 font-bold">{day.operations}/45</span>
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
