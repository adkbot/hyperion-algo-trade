-- FASE 1: Tabela de persistência de estado entre sessões
-- Armazena C1 Direction (Oceania), confirmação (Asia), Range (London)
-- para uso coordenado em NY e análise histórica

CREATE TABLE public.session_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL,
  
  -- Oceania data
  c1_direction TEXT, -- 'LONG', 'SHORT', 'NEUTRAL'
  c1_confidence NUMERIC DEFAULT 0,
  oceania_high NUMERIC,
  oceania_low NUMERIC,
  
  -- Asia data
  asia_confirmation TEXT, -- 'CONFIRMED', 'REVERSED', 'WEAK'
  asia_direction TEXT,
  
  -- London data
  london_range_high NUMERIC,
  london_range_low NUMERIC,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, date)
);

-- Enable RLS
ALTER TABLE public.session_state ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own session state"
  ON public.session_state
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own session state"
  ON public.session_state
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own session state"
  ON public.session_state
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX idx_session_state_user_date ON public.session_state(user_id, date);

-- Trigger for updated_at
CREATE TRIGGER update_session_state_updated_at
  BEFORE UPDATE ON public.session_state
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();