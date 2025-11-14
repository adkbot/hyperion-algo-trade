import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useOperations } from "@/hooks/useTradingData";

export const OperationHistory = () => {
  const { data: operationsData } = useOperations();

  const operations = operationsData?.map((op) => ({
    id: op.id,
    time: new Date(op.entry_time).toLocaleTimeString('pt-BR'),
    asset: op.asset,
    type: op.direction.toLowerCase(), // 'buy' or 'sell'
    entry: op.entry_price,
    exit: op.exit_price || 0,
    pnl: op.pnl || 0,
    rr: `1:${op.risk_reward.toFixed(1)}`,
    status: op.result?.toLowerCase() || 'open',
    strategy: op.strategy || 'UNKNOWN',
    agents: op.agents ? Object.keys(op.agents as object) : [],
    agentsData: op.agents as any,
  })).filter(op => op.status !== 'open') || [];

  const getStrategyBadge = (strategy: string) => {
    const config = {
      FIRST_CANDLE_RULE: { icon: '🎯', color: 'bg-green-500/10 text-green-500 border-green-500/20', name: 'First Candle' },
      SCALPING_1MIN: { icon: '⚡', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', name: 'Scalping' },
      SWEEP_LIQUIDITY: { icon: '🌊', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', name: 'Sweep' },
      UNKNOWN: { icon: '❓', color: 'bg-gray-500/10 text-gray-500 border-gray-500/20', name: 'N/A' },
    };
    const c = config[strategy as keyof typeof config] || config.UNKNOWN;
    return <Badge variant="outline" className={`text-xs ${c.color}`}>{c.icon} {c.name}</Badge>;
  };

  const totalWins = operations.filter(op => op.status === "win").length;
  const totalLosses = operations.filter(op => op.status === "loss").length;
  const totalPnL = operations.reduce((sum, op) => sum + op.pnl, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Histórico de Operações</CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Wins:</span>
              <Badge variant="outline" className="border-profit text-profit">{totalWins}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Losses:</span>
              <Badge variant="outline" className="border-loss text-loss">{totalLosses}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">P&L Total:</span>
              <Badge className={totalPnL >= 0 ? "bg-profit" : "bg-loss"}>
                ${totalPnL.toFixed(2)}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Horário</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estratégia</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>R:R</TableHead>
              <TableHead>P&L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.map((op) => (
              <TableRow key={op.id}>
                <TableCell className="font-mono text-xs">{op.time}</TableCell>
                <TableCell className="font-medium">{op.asset}</TableCell>
                <TableCell>
                  <div className={`flex items-center gap-1 ${op.type === "buy" ? "text-profit" : "text-loss"}`}>
                    {op.type === "buy" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    {op.type === "buy" ? "Compra" : "Venda"}
                  </div>
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        {getStrategyBadge(op.strategy)}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="text-xs space-y-1">
                          <div className="font-semibold">Setup Details:</div>
                          {op.agentsData && typeof op.agentsData === 'object' && (
                            <div className="space-y-0.5">
                              {Object.entries(op.agentsData).slice(0, 5).map(([key, value]) => (
                                <div key={key} className="text-muted-foreground">
                                  {key}: {typeof value === 'number' ? value.toFixed(4) : String(value)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="font-mono text-sm">${op.entry.toLocaleString()}</TableCell>
                <TableCell className="font-mono text-sm">${op.exit.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline">{op.rr}</Badge>
                </TableCell>
                <TableCell className={`font-bold ${op.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                  ${op.pnl.toFixed(2)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
