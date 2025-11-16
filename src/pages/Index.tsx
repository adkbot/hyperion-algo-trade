import { useState, useEffect } from "react";
import { TradingHeader } from "@/components/trading/TradingHeader";
import { TradingChart } from "@/components/trading/TradingChart";
import { AgentPanel } from "@/components/trading/AgentPanel";
import { StatsPanel } from "@/components/trading/StatsPanel";
import { OperationHistory } from "@/components/trading/OperationHistory";
import { AlertPanel } from "@/components/trading/AlertPanel";
import { ActivePositions } from "@/components/trading/ActivePositions";
import { DailyGoals } from "@/components/trading/DailyGoals";
import { DailyHistory } from "@/components/trading/DailyHistory";
import { SessionCyclePanel } from "@/components/trading/SessionCyclePanel";
import { SessionStatePanel } from "@/components/trading/SessionStatePanel";
import { SystemStatusPanel } from "@/components/trading/SystemStatusPanel";
import { ADKPanel } from "@/components/trading/ADKPanel";
import { FoundationDiagnostic } from "@/components/trading/FoundationDiagnostic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserSettings } from "@/hooks/useTradingData";
import { useTradingOrchestrator } from "@/hooks/useTradingOrchestrator";
import { useRealtimeUpdates } from "@/hooks/useRealtimeUpdates";
import { useSessionHistory } from "@/hooks/useSessionHistory";

const Index = () => {
  const { data: settings } = useUserSettings();
  const [botStatus, setBotStatus] = useState<"stopped" | "running" | "paused">("stopped");

  // Enable realtime updates for all tables
  useRealtimeUpdates();
  
  // Subscribe to session history updates
  useSessionHistory();

  // Start orchestrator loop when bot is running
  useTradingOrchestrator(botStatus);

  useEffect(() => {
    if (settings) {
      setBotStatus(settings.bot_status as "stopped" | "running" | "paused");
    }
  }, [settings]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TradingHeader botStatus={botStatus} setBotStatus={setBotStatus} />
      
      <div className="container mx-auto p-4">
        {/* Alert Panel */}
        <div className="mb-4">
          <AlertPanel />
        </div>
        
        {/* Grid Layout - Chart + Tabs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* Left Column (2/3) - Chart */}
          <div className="lg:col-span-2">
            <TradingChart />
          </div>
          
          {/* Right Column (1/3) - Tabs */}
          <div className="lg:col-span-1">
            <Tabs defaultValue="monitoring" className="w-full">
              <TabsList className="grid w-full grid-cols-4 mb-4">
                <TabsTrigger value="monitoring">Monitor</TabsTrigger>
                <TabsTrigger value="strategy">ADK</TabsTrigger>
                <TabsTrigger value="sessions">Sessões</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>
              
              <TabsContent value="monitoring" className="space-y-4 mt-0">
                <StatsPanel />
                <ActivePositions />
                <SystemStatusPanel />
              </TabsContent>
              
              <TabsContent value="strategy" className="space-y-4 mt-0">
                <ADKPanel />
                <FoundationDiagnostic />
                <AgentPanel />
              </TabsContent>
              
              <TabsContent value="sessions" className="space-y-4 mt-0">
                <DailyGoals />
                <SessionStatePanel />
                <SessionCyclePanel />
              </TabsContent>
              
              <TabsContent value="history" className="space-y-4 mt-0">
                <OperationHistory />
                <DailyHistory />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
