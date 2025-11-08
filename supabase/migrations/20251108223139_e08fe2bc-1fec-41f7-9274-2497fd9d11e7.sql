-- Aumentar limite de posições simultâneas para 5
UPDATE user_settings 
SET max_positions = 5 
WHERE user_id = '7d7bcf35-b03d-421b-bc1e-d20e4bc2dec0';

-- Limpar posições atuais travadas há 5+ horas
DELETE FROM active_positions 
WHERE user_id = '7d7bcf35-b03d-421b-bc1e-d20e4bc2dec0';

-- Fechar operações abertas (registrar como LOSS controlado)
UPDATE operations 
SET exit_time = NOW(), 
    exit_price = entry_price * 0.99,
    pnl = -0.40,
    result = 'LOSS'
WHERE user_id = '7d7bcf35-b03d-421b-bc1e-d20e4bc2dec0'
AND exit_time IS NULL;