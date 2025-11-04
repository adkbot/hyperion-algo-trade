import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useOperations } from "@/hooks/useTradingData";

export const OperationHistory = () => {
  const { data: operationsData } = useOperations();

  const operations = operationsData?.map((op) => ({
    id: op.id,
    time: new Date(op.entry_time).toLocaleTimeString('pt-BR'),
    asset: op.asset,
    type: op.direction.toLowerCase(),
    entry: op.entry_price,
    exit: op.exit_price || 0,
    pnl: op.pnl || 0,
    rr: `1:${op.risk_reward.toFixed(1)}`,
    status: op.result?.toLowerCase() || 'open',
    agents: op.agents ? Object.keys(op.agents as object) : [],
  })).filter(op => op.status !== 'open') || [];

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
              <TableHead>Entrada</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>R:R</TableHead>
              <TableHead>P&L</TableHead>
              <TableHead>Agentes</TableHead>
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
                <TableCell className="font-mono text-sm">${op.entry.toLocaleString()}</TableCell>
                <TableCell className="font-mono text-sm">${op.exit.toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant="outline">{op.rr}</Badge>
                </TableCell>
                <TableCell className={`font-bold ${op.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                  ${op.pnl.toFixed(2)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {op.agents.map((agent, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {agent}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
