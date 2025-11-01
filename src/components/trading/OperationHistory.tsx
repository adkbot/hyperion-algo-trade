import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp } from "lucide-react";

export const OperationHistory = () => {
  const operations = [
    {
      id: 1,
      time: "14:32:15",
      asset: "BTCUSDT",
      type: "sell",
      entry: 68100,
      exit: 67500,
      pnl: 180.50,
      rr: "1:4.2",
      status: "win",
      agents: ["VolumeProfile", "Wyckoff", "CHoCH"]
    },
    {
      id: 2,
      time: "13:45:22",
      asset: "ETHUSDT",
      type: "buy",
      entry: 3250,
      exit: 3280,
      pnl: 90.00,
      rr: "1:3.5",
      status: "win",
      agents: ["FibonacciOTE", "VWMA", "SessionTracker"]
    },
    {
      id: 3,
      time: "12:18:30",
      asset: "BTCUSDT",
      type: "buy",
      entry: 67800,
      exit: 67750,
      pnl: -30.00,
      rr: "1:3.0",
      status: "loss",
      agents: ["VolumeProfile", "RiskManager"]
    },
    {
      id: 4,
      time: "11:05:45",
      asset: "ETHUSDT",
      type: "sell",
      entry: 3290,
      exit: 3240,
      pnl: 150.25,
      rr: "1:3.8",
      status: "win",
      agents: ["Wyckoff", "CHoCH", "VWMA"]
    },
    {
      id: 5,
      time: "09:30:12",
      asset: "BTCUSDT",
      type: "buy",
      entry: 67500,
      exit: 67950,
      pnl: 135.00,
      rr: "1:3.2",
      status: "win",
      agents: ["SessionTracker", "FibonacciOTE", "VolumeProfile"]
    },
  ];

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
