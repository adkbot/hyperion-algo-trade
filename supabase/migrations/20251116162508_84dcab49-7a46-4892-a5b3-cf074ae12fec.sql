-- Create ADK Strategy State table
CREATE TABLE IF NOT EXISTS public.adk_strategy_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  date DATE NOT NULL,
  current_phase TEXT NOT NULL,
  foundation_data JSONB,
  fvg15m_data JSONB,
  retest_data JSONB,
  confirmation1m_data JSONB,
  entry_signal JSONB,
  next_action TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, asset, date)
);

-- Enable RLS
ALTER TABLE public.adk_strategy_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own ADK state"
  ON public.adk_strategy_state
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own ADK state"
  ON public.adk_strategy_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own ADK state"
  ON public.adk_strategy_state
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own ADK state"
  ON public.adk_strategy_state
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add index for faster queries
CREATE INDEX idx_adk_strategy_state_user_date ON public.adk_strategy_state(user_id, date);
CREATE INDEX idx_adk_strategy_state_updated ON public.adk_strategy_state(updated_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.adk_strategy_state;