-- Adicionar nova estratégia FIRST_CANDLE_ADK e campos para multi-timeframe foundation

-- Adicionar novos campos na tabela session_foundation para suportar 15m
ALTER TABLE session_foundation 
ADD COLUMN IF NOT EXISTS timeframe text DEFAULT '5m',
ADD COLUMN IF NOT EXISTS validity_type text DEFAULT 'SESSION_5MIN';

-- Criar índice para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_session_foundation_timeframe 
ON session_foundation(user_id, session, date, timeframe);

-- Adicionar comentários para documentação
COMMENT ON COLUMN session_foundation.timeframe IS 'Timeframe da foundation: 5m ou 15m';
COMMENT ON COLUMN session_foundation.validity_type IS 'Tipo de validade: SESSION_5MIN (5 minutos) ou DAY_15MIN (dia todo)';