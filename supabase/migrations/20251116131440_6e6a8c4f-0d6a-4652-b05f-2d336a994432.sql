-- Ativar estratégia SWEEP_LIQUIDITY (2CR)
UPDATE user_settings 
SET trading_strategy = 'SWEEP_LIQUIDITY'
WHERE user_id = '7d7bcf35-b03d-421b-bc1e-d20e4bc2dec0';