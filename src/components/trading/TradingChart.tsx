import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";

export const TradingChart = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentAsset, setCurrentAsset] = useState("BTCUSDT");

  useEffect(() => {
    if (!containerRef.current) return;

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      if (containerRef.current && (window as any).TradingView) {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: `BINANCE:${currentAsset}`,
          interval: "15",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "pt_BR",
          toolbar_bg: "#0a0a0a",
          enable_publishing: false,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          container_id: "tradingview_chart",
          studies: [
            "Volume@tv-basicstudies",
            "VWMA@tv-basicstudies"
          ],
          disabled_features: ["use_localstorage_for_settings"],
          enabled_features: ["study_templates"],
          overrides: {
            "mainSeriesProperties.candleStyle.upColor": "#10b981",
            "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#10b981",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
            "mainSeriesProperties.candleStyle.wickUpColor": "#10b981",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
          }
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, [currentAsset]);

  return (
    <Card className="h-[500px]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Gráfico de Trading - M15</CardTitle>
          <Badge variant="outline" className="font-mono">{currentAsset}</Badge>
        </div>
      </CardHeader>
      <CardContent className="h-[calc(100%-4rem)]">
        <div id="tradingview_chart" ref={containerRef} className="w-full h-full" />
      </CardContent>
    </Card>
  );
};
