-- Limpar registro com user_id NULL que está causando erros
DELETE FROM user_settings WHERE user_id IS NULL;

-- Adicionar índice para melhorar performance de consultas por user_id e date
CREATE INDEX IF NOT EXISTS idx_session_state_user_date ON session_state(user_id, date);
CREATE INDEX IF NOT EXISTS idx_daily_goals_user_date ON daily_goals(user_id, date);