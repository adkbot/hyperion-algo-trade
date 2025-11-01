import { useState } from "react";
import { TradingHeader } from "@/components/trading/TradingHeader";
import { TradingChart } from "@/components/trading/TradingChart";
import { AgentPanel } from "@/components/trading/AgentPanel";
import { StatsPanel } from "@/components/trading/StatsPanel";
import { OperationHistory } from "@/components/trading/OperationHistory";
import { AlertPanel } from "@/components/trading/AlertPanel";
import { ActivePositions } from "@/components/trading/ActivePositions";
import { DailyGoals } from "@/components/trading/DailyGoals";
import { DailyHistory } from "@/components/trading/DailyHistory";

const Index = () => {
  const [botStatus, setBotStatus] = useState<"stopped" | "running" | "paused">("stopped");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TradingHeader botStatus={botStatus} setBotStatus={setBotStatus} />
      
      <div className="container mx-auto p-4 space-y-4">
        {/* Alert Panel */}
        <AlertPanel />
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Chart - Takes 2 columns on large screens */}
          <div className="lg:col-span-2 space-y-4">
            <TradingChart />
            <ActivePositions />
          </div>
          
          {/* Right Sidebar - Stats, Goals and Agents */}
          <div className="space-y-4">
            <StatsPanel />
            <DailyGoals />
            <AgentPanel />
          </div>
        </div>
        
        {/* Bottom Grid - History */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <OperationHistory />
          </div>
          <div>
            <DailyHistory />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
