-- Função para atualizar daily_goals quando uma operação é fechada
CREATE OR REPLACE FUNCTION update_daily_goals_on_operation_close()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  operation_date DATE;
  daily_goal_id UUID;
BEGIN
  -- Só processa se a operação mudou de OPEN para WIN ou LOSS
  IF (OLD.result = 'OPEN' OR OLD.result IS NULL) AND (NEW.result = 'WIN' OR NEW.result = 'LOSS') THEN
    
    -- Pega a data da operação
    operation_date := DATE(NEW.entry_time);
    
    -- Busca ou cria o registro de daily_goals para este dia
    INSERT INTO daily_goals (date, user_id, total_operations, wins, losses, total_pnl)
    VALUES (
      operation_date,
      NEW.user_id,
      0,
      0,
      0,
      0
    )
    ON CONFLICT (date, user_id) DO NOTHING
    RETURNING id INTO daily_goal_id;
    
    -- Atualiza os contadores
    UPDATE daily_goals
    SET
      total_operations = total_operations + 1,
      wins = CASE WHEN NEW.result = 'WIN' THEN wins + 1 ELSE wins END,
      losses = CASE WHEN NEW.result = 'LOSS' THEN losses + 1 ELSE losses END,
      total_pnl = total_pnl + COALESCE(NEW.pnl, 0)
    WHERE date = operation_date AND user_id = NEW.user_id;
    
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar TRIGGER na tabela operations
DROP TRIGGER IF EXISTS trigger_update_daily_goals ON operations;

CREATE TRIGGER trigger_update_daily_goals
AFTER UPDATE ON operations
FOR EACH ROW
EXECUTE FUNCTION update_daily_goals_on_operation_close();

-- Adicionar constraint UNIQUE em daily_goals se não existir
ALTER TABLE daily_goals DROP CONSTRAINT IF EXISTS daily_goals_date_user_id_key;
ALTER TABLE daily_goals ADD CONSTRAINT daily_goals_date_user_id_key UNIQUE (date, user_id);

-- Sincronizar dados históricos (recalcular todos os daily_goals baseado nas operações fechadas)
TRUNCATE TABLE daily_goals;

INSERT INTO daily_goals (date, user_id, total_operations, wins, losses, total_pnl, created_at)
SELECT 
  DATE(entry_time) as date,
  user_id,
  COUNT(*) as total_operations,
  COUNT(*) FILTER (WHERE result = 'WIN') as wins,
  COUNT(*) FILTER (WHERE result = 'LOSS') as losses,
  COALESCE(SUM(pnl), 0) as total_pnl,
  MIN(entry_time) as created_at
FROM operations
WHERE result IN ('WIN', 'LOSS')
  AND entry_time IS NOT NULL
  AND user_id IS NOT NULL
GROUP BY DATE(entry_time), user_id
ON CONFLICT (date, user_id) DO UPDATE SET
  total_operations = EXCLUDED.total_operations,
  wins = EXCLUDED.wins,
  losses = EXCLUDED.losses,
  total_pnl = EXCLUDED.total_pnl;