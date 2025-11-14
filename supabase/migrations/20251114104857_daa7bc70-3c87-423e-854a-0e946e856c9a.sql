-- Adicionar campo strategy na tabela operations
ALTER TABLE operations ADD COLUMN IF NOT EXISTS strategy TEXT;

COMMENT ON COLUMN operations.strategy IS 'Estratégia usada: SWEEP_LIQUIDITY, SCALPING_1MIN, FIRST_CANDLE_RULE';

-- Adicionar campos event_type e event_data na tabela session_history (se não existirem)
ALTER TABLE session_history ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE session_history ADD COLUMN IF NOT EXISTS event_data JSONB;

COMMENT ON COLUMN session_history.event_type IS 'Tipo de evento: FOUNDATION_DETECTED, BREAKOUT, RETEST, ENGULFING';
COMMENT ON COLUMN session_history.event_data IS 'Dados adicionais do evento em formato JSON';