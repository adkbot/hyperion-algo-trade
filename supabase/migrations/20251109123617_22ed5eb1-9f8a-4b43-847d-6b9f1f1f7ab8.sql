-- Add leverage and profit target settings
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS leverage integer DEFAULT 20;

ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS profit_target_percent numeric DEFAULT 100;

COMMENT ON COLUMN user_settings.leverage IS 'Alavancagem aplicada em todas as operações (1-125x)';
COMMENT ON COLUMN user_settings.profit_target_percent IS 'Meta de lucro por trade em % do saldo (ex: 100 = dobrar saldo)';