import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useRef } from "react";

export const TradingChart = () => {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Simulated candlestick chart - in production, use TradingView widget or lightweight-charts
    // This is a placeholder for the actual chart implementation
  }, []);

  return (
    <Card className="h-[600px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">BTCUSDT - M15</CardTitle>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Último: <span className="text-foreground font-mono">$68,245.50</span></span>
            <span className="text-profit">+2.45%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={chartRef} className="h-[520px] bg-chart-bg relative overflow-hidden">
          {/* Chart Grid Background */}
          <svg className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="hsl(var(--chart-grid))" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
          
          {/* Placeholder for TradingView/Chart Library */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-muted-foreground text-sm">Gráfico de Candlestick em Tempo Real</p>
              <p className="text-xs text-muted-foreground">
                Indicadores: Volume Profile, Fibonacci OTE, Wyckoff, VWMA
              </p>
            </div>
          </div>
          
          {/* Agent Markers Overlay */}
          <div className="absolute top-4 right-4 space-y-2 text-xs">
            <div className="bg-card/90 backdrop-blur-sm p-2 rounded border border-border">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-success" />
                <span>POC: $67,850</span>
              </div>
            </div>
            <div className="bg-card/90 backdrop-blur-sm p-2 rounded border border-border">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-warning" />
                <span>OTE: 70.5%</span>
              </div>
            </div>
            <div className="bg-card/90 backdrop-blur-sm p-2 rounded border border-border">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-destructive" />
                <span>LPSY: $68,100</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
