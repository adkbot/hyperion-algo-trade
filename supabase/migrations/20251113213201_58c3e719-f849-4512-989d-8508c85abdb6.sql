-- ============================================
-- TIMER AUTOMÁTICO PARA COOLDOWN
-- ============================================
-- Adicionar coluna para controlar quando o cooldown deve ser reabilitado
ALTER TABLE user_settings 
ADD COLUMN cooldown_disabled_until TIMESTAMPTZ DEFAULT NULL;

-- Comentário explicativo
COMMENT ON COLUMN user_settings.cooldown_disabled_until IS 
'Timestamp até quando o cooldown está desabilitado. NULL = cooldown ativo normal. Se > now(), cooldown está desabilitado.';

-- Setar timer inicial para o usuário atual (24h a partir de agora)
-- Isso permite que o Smart Asset Scanner funcione imediatamente
UPDATE user_settings 
SET cooldown_disabled_until = NOW() + INTERVAL '24 hours'
WHERE user_id IS NOT NULL;