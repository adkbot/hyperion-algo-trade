-- Create session_history table to track trading sessions and cycles
CREATE TABLE IF NOT EXISTS public.session_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  timestamp timestamp with time zone NOT NULL,
  pair text NOT NULL,
  session text NOT NULL, -- 'Oceania', 'Asia', 'London', 'NewYork'
  cycle_phase text NOT NULL, -- 'Projection', 'Consolidation', 'Execution'
  direction text, -- 'LONG', 'SHORT', 'NEUTRAL'
  volume_factor numeric,
  confirmation text,
  risk jsonb, -- {entry, stop, target, rr_ratio}
  confidence_score numeric,
  notes text,
  market_data jsonb, -- candles, indicators, etc
  c1_direction text, -- First cycle direction from Oceania
  range_high numeric, -- London consolidation range
  range_low numeric,
  signal text -- 'LONG', 'SHORT', 'STAY_OUT'
);

-- Enable RLS
ALTER TABLE public.session_history ENABLE ROW LEVEL SECURITY;

-- Create policy for full access
CREATE POLICY "Allow all operations on session_history" 
ON public.session_history 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_session_history_timestamp ON public.session_history(timestamp DESC);
CREATE INDEX idx_session_history_session ON public.session_history(session);
CREATE INDEX idx_session_history_pair ON public.session_history(pair);

-- Enable realtime
ALTER TABLE public.session_history REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.session_history;