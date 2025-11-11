-- ============================================
-- FIX: Sincronizar operations OPEN para active_positions
-- ============================================

-- Inserir posições OPEN que não estão em active_positions
INSERT INTO active_positions (
  user_id,
  asset,
  direction,
  entry_price,
  current_price,
  stop_loss,
  take_profit,
  risk_reward,
  projected_profit,
  current_pnl,
  session,
  agents,
  opened_at
)
SELECT DISTINCT ON (user_id, asset)
  user_id,
  asset,
  direction,
  entry_price,
  entry_price as current_price,
  stop_loss,
  take_profit,
  risk_reward,
  CASE 
    WHEN direction = 'SHORT' THEN (entry_price - take_profit) * ABS(risk_reward)
    ELSE (take_profit - entry_price) * ABS(risk_reward)
  END as projected_profit,
  COALESCE(pnl, 0) as current_pnl,
  session,
  agents,
  entry_time as opened_at
FROM operations
WHERE result = 'OPEN'
  AND NOT EXISTS (
    SELECT 1 FROM active_positions ap
    WHERE ap.user_id = operations.user_id
      AND ap.asset = operations.asset
  )
ORDER BY user_id, asset, created_at DESC;