import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useOperations } from "@/hooks/useTradingData";
import { useIsMobile } from "@/hooks/use-mobile";

export const OperationHistory = () => {
  const { data: operationsData } = useOperations();
  const isMobile = useIsMobile();

  const operations = operationsData?.map((op: any) => ({
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
      FVG_MULTI_TF: { icon: '📈', color: 'bg-purple-500/10 text-purple-500 border-purple-500/20', name: 'FVG Multi-TF' },
      SCALPING_1MIN: { icon: '⚡', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20', name: 'Scalping' },
      SWEEP_LIQUIDITY: { icon: '🌊', color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', name: 'Sweep' },
      FIRST_CANDLE_ADK: { icon: '🔷', color: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20', name: 'ADK' },
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-base sm:text-lg">Histórico</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Wins:</span>
              <Badge variant="outline" className="border-profit text-profit text-xs">{totalWins}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">Losses:</span>
              <Badge variant="outline" className="border-loss text-loss text-xs">{totalLosses}</Badge>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground">P&L:</span>
              <Badge className={`${totalPnL >= 0 ? "bg-profit" : "bg-loss"} text-xs`}>
                ${totalPnL.toFixed(2)}
              </Badge>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isMobile ? (
          // MOBILE: Cards verticais
          <div className="space-y-3">
            {operations.map((op) => (
              <Card key={op.id} className="p-3 bg-secondary/30">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{op.asset}</span>
                    <Badge className={`text-xs ${op.status === "win" ? "bg-profit" : "bg-loss"}`}>
                      {op.status === "win" ? "WIN" : "LOSS"}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Tipo:</span>
                      <div className={`flex items-center gap-1 mt-1 ${op.type === "buy" ? "text-profit" : "text-loss"}`}>
                        {op.type === "buy" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        <span className="font-medium uppercase">{op.type}</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Horário:</span>
                      <div className="font-mono mt-1">{op.time}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Entrada:</span>
                      <div className="font-mono mt-1">${op.entry.toFixed(4)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Saída:</span>
                      <div className="font-mono mt-1">${op.exit.toFixed(4)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">R:R:</span>
                      <div className="font-medium mt-1">{op.rr}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Estratégia:</span>
                      <div className="mt-1">{getStrategyBadge(op.strategy)}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-xs text-muted-foreground">P&L</span>
                    <span className={`font-bold text-sm ${op.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                      {op.pnl >= 0 ? '+' : ''}${op.pnl.toFixed(2)}
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          // DESKTOP: Tabela completa
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
        )}
      </CardContent>
    </Card>
  );
};
