-- ═══════════════════════════════════════════════════════════════════════════
-- FASE 5: TABELA DE MÉTRICAS DE PROTEÇÃO RR 1:1
-- ═══════════════════════════════════════════════════════════════════════════
-- Rastreia decisões de fechamento/manutenção na zona de proteção

CREATE TABLE IF NOT EXISTS public.protection_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  position_id UUID,
  asset TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('CLOSED', 'MAINTAINED')),
  rr_at_decision DECIMAL NOT NULL,
  reason TEXT NOT NULL,
  confidence DECIMAL NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_protection_logs_user_id ON public.protection_logs(user_id);
CREATE INDEX idx_protection_logs_asset ON public.protection_logs(asset);
CREATE INDEX idx_protection_logs_decision ON public.protection_logs(decision);
CREATE INDEX idx_protection_logs_created_at ON public.protection_logs(created_at DESC);

-- RLS Policies
ALTER TABLE public.protection_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own protection logs"
  ON public.protection_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own protection logs"
  ON public.protection_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own protection logs"
  ON public.protection_logs FOR DELETE
  USING (auth.uid() = user_id);

-- Comentário da tabela
COMMENT ON TABLE public.protection_logs IS 'Rastreia decisões de proteção RR 1:1 para análise de efetividade';