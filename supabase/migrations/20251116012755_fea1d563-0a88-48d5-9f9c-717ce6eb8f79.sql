-- Criar tabela para sinais pendentes de execução
CREATE TABLE IF NOT EXISTS public.pending_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  strategy TEXT NOT NULL,
  session TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  stop_loss NUMERIC NOT NULL,
  take_profit NUMERIC NOT NULL,
  risk_reward NUMERIC NOT NULL,
  confidence_score NUMERIC,
  agents JSONB,
  signal_data JSONB,
  detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, EXECUTED, EXPIRED, CANCELLED
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_pending_signals_user_status ON public.pending_signals(user_id, status);
CREATE INDEX idx_pending_signals_expires_at ON public.pending_signals(expires_at);

-- RLS Policies
ALTER TABLE public.pending_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pending signals"
  ON public.pending_signals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pending signals"
  ON public.pending_signals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own pending signals"
  ON public.pending_signals FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pending signals"
  ON public.pending_signals FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_pending_signals_updated_at
  BEFORE UPDATE ON public.pending_signals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();