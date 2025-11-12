-- Adicionar coluna de estratégia de trading em user_settings
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS trading_strategy TEXT DEFAULT 'SWEEP_LIQUIDITY';

COMMENT ON COLUMN user_settings.trading_strategy IS 'Estratégia de trading: SWEEP_LIQUIDITY ou SCALPING_1MIN';

-- Criar tabela para armazenar fundação de cada sessão (primeira vela de 5min)
CREATE TABLE IF NOT EXISTS session_foundation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session TEXT NOT NULL,
  date DATE NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session, date)
);

-- Habilitar RLS na tabela session_foundation
ALTER TABLE session_foundation ENABLE ROW LEVEL SECURITY;

-- Policies para session_foundation
CREATE POLICY "Users can view their own session foundations"
ON session_foundation FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own session foundations"
ON session_foundation FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own session foundations"
ON session_foundation FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own session foundations"
ON session_foundation FOR DELETE
USING (auth.uid() = user_id);

-- Criar tabela para controlar quantidade de trades por sessão (máximo 1)
CREATE TABLE IF NOT EXISTS session_trade_count (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session TEXT NOT NULL,
  date DATE NOT NULL,
  trade_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, session, date)
);

-- Habilitar RLS na tabela session_trade_count
ALTER TABLE session_trade_count ENABLE ROW LEVEL SECURITY;

-- Policies para session_trade_count
CREATE POLICY "Users can view their own session trade counts"
ON session_trade_count FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own session trade counts"
ON session_trade_count FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own session trade counts"
ON session_trade_count FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own session trade counts"
ON session_trade_count FOR DELETE
USING (auth.uid() = user_id);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_session_foundation_user_date ON session_foundation(user_id, date);
CREATE INDEX IF NOT EXISTS idx_session_trade_count_user_date ON session_trade_count(user_id, date);