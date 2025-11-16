-- Ajustar configurações de segurança para testes
UPDATE user_settings
SET 
  risk_per_trade = 2,
  paper_mode = true,
  updated_at = now()
WHERE user_id IN (SELECT id FROM auth.users LIMIT 1);