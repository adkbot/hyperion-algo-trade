import { Card } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus, Activity, Target, BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export function SessionStatePanel() {
  const { data: sessionState, isLoading } = useQuery({
    queryKey: ['session-state'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const today = new Date().toISOString().split('T')[0];
      
      const { data } = await supabase
        .from('session_state')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      return data;
    },
    refetchInterval: 5000,
  });

  const { data: dailyGoals } = useQuery({
    queryKey: ['daily-goals-progress'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const today = new Date().toISOString().split('T')[0];
      
      const { data } = await supabase
        .from('daily_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('date', today)
        .maybeSingle();

      return data;
    },
    refetchInterval: 3000,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-muted rounded w-1/3"></div>
          <div className="h-8 bg-muted rounded w-2/3"></div>
        </div>
      </Card>
    );
  }

  const getDirectionIcon = (direction: string | null) => {
    if (!direction) return <Minus className="h-5 w-5 text-muted-foreground" />;
    if (direction === 'LONG') return <TrendingUp className="h-5 w-5 text-success" />;
    if (direction === 'SHORT') return <TrendingDown className="h-5 w-5 text-destructive" />;
    return <Minus className="h-5 w-5 text-muted-foreground" />;
  };

  const getDirectionColor = (direction: string | null) => {
    if (!direction) return 'muted';
    if (direction === 'LONG') return 'success';
    if (direction === 'SHORT') return 'destructive';
    return 'muted';
  };

  const getConfirmationBadge = (confirmation: string | null) => {
    if (!confirmation) return null;
    
    const variants: Record<string, 'default' | 'destructive' | 'outline' | 'secondary'> = {
      'CONFIRMED': 'default',
      'REVERSED': 'secondary',
      'WEAK': 'outline',
    };

    return (
      <Badge variant={variants[confirmation] || 'default'} className="text-xs">
        {confirmation}
      </Badge>
    );
  };

  const targetOps = dailyGoals?.target_operations || 45;
  const currentOps = dailyGoals?.total_operations || 0;
  const progressPercent = (currentOps / targetOps) * 100;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Fimathe Cycles State</h3>
          </div>
          <Badge variant="outline" className="text-xs">
            {new Date().toLocaleDateString()}
          </Badge>
        </div>

        {/* C1 Direction - Oceania */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">C1 Direction (Oceania)</span>
            {sessionState?.c1_direction ? (
              <div className="flex items-center gap-2">
                {getDirectionIcon(sessionState.c1_direction)}
                <Badge variant={getDirectionColor(sessionState.c1_direction) as any}>
                  {sessionState.c1_direction}
                </Badge>
              </div>
            ) : (
              <Badge variant="outline" className="text-xs">Not Set</Badge>
            )}
          </div>
          {sessionState?.c1_confidence && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              <Progress 
                value={sessionState.c1_confidence * 100} 
                className="flex-1 h-2"
              />
              <span className="text-xs font-mono">
                {(sessionState.c1_confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}
        </div>

        {/* Asia Confirmation */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Asia Status</span>
            <div className="flex items-center gap-2">
              {getConfirmationBadge(sessionState?.asia_confirmation)}
              {sessionState?.asia_direction && (
                <>
                  {getDirectionIcon(sessionState.asia_direction)}
                  <span className="text-sm font-medium">
                    {sessionState.asia_direction}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* London Range */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">London Range</span>
          </div>
          {sessionState?.london_range_high && sessionState?.london_range_low ? (
            <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Low</span>
                <span className="text-sm font-mono font-medium">
                  {Number(sessionState.london_range_low).toFixed(2)}
                </span>
              </div>
              <div className="h-8 w-px bg-border"></div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">High</span>
                <span className="text-sm font-mono font-medium">
                  {Number(sessionState.london_range_high).toFixed(2)}
                </span>
              </div>
              <div className="h-8 w-px bg-border"></div>
              <div className="flex flex-col">
                <span className="text-xs text-muted-foreground">Size</span>
                <span className="text-sm font-mono font-medium">
                  {(Number(sessionState.london_range_high) - Number(sessionState.london_range_low)).toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-3 text-sm text-muted-foreground bg-muted/30 rounded-lg">
              Range not set yet
            </div>
          )}
        </div>

        {/* Operations Progress */}
        <div className="space-y-2 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Daily Operations</span>
            </div>
            <span className="text-sm font-mono">
              {currentOps} / {targetOps}
            </span>
          </div>
          <Progress value={progressPercent} className="h-3" />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {dailyGoals?.wins || 0} Wins • {dailyGoals?.losses || 0} Losses
            </span>
            <span className={dailyGoals?.total_pnl && dailyGoals.total_pnl >= 0 ? 'text-success' : 'text-destructive'}>
              {dailyGoals?.total_pnl ? `$${dailyGoals.total_pnl.toFixed(2)}` : '$0.00'}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
