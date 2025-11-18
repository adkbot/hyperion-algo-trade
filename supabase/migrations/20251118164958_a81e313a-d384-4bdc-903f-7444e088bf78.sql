-- Atualizar estratégia de trading para remover FIRST_CANDLE_RULE e adicionar FVG_MULTI_TF
-- Usuários com FIRST_CANDLE_RULE serão migrados para FVG_MULTI_TF automaticamente

-- Atualizar user_settings existentes
UPDATE user_settings 
SET 
  trading_strategy = 'FVG_MULTI_TF',
  updated_at = now()
WHERE trading_strategy = 'FIRST_CANDLE_RULE';

-- Atualizar operations existentes (para histórico)
UPDATE operations 
SET strategy = 'LEGACY_FIRST_CANDLE'
WHERE strategy = 'FIRST_CANDLE_RULE';

-- Comentário: FVG_MULTI_TF é a evolução da First Candle Rule
-- Estratégias disponíveis agora: SWEEP_LIQUIDITY, SCALPING_1MIN, FVG_MULTI_TF, FIRST_CANDLE_ADK
