-- Padronizar nomes de sessão inconsistentes no banco de dados
-- Converte 'NewYork' para 'NY', 'Oceania' para 'OCEANIA', 'Asia' para 'ASIA', 'London' para 'LONDON'

-- 1. Atualizar session_foundation
UPDATE session_foundation 
SET session = CASE 
  WHEN session = 'NewYork' THEN 'NY'
  WHEN session = 'Oceania' THEN 'OCEANIA'
  WHEN session = 'Asia' THEN 'ASIA'
  WHEN session = 'London' THEN 'LONDON'
  ELSE session
END
WHERE session IN ('NewYork', 'Oceania', 'Asia', 'London');

-- 2. Atualizar session_trade_count
UPDATE session_trade_count
SET session = CASE 
  WHEN session = 'NewYork' THEN 'NY'
  WHEN session = 'Oceania' THEN 'OCEANIA'
  WHEN session = 'Asia' THEN 'ASIA'
  WHEN session = 'London' THEN 'LONDON'
  ELSE session
END
WHERE session IN ('NewYork', 'Oceania', 'Asia', 'London');

-- 3. Atualizar session_history
UPDATE session_history
SET session = CASE 
  WHEN session = 'NewYork' THEN 'NY'
  WHEN session = 'Oceania' THEN 'OCEANIA'
  WHEN session = 'Asia' THEN 'ASIA'
  WHEN session = 'London' THEN 'LONDON'
  ELSE session
END
WHERE session IN ('NewYork', 'Oceania', 'Asia', 'London');

-- 4. Atualizar active_positions
UPDATE active_positions
SET session = CASE 
  WHEN session = 'NewYork' THEN 'NY'
  WHEN session = 'Oceania' THEN 'OCEANIA'
  WHEN session = 'Asia' THEN 'ASIA'
  WHEN session = 'London' THEN 'LONDON'
  ELSE session
END
WHERE session IN ('NewYork', 'Oceania', 'Asia', 'London');

-- 5. Atualizar operations
UPDATE operations
SET session = CASE 
  WHEN session = 'NewYork' THEN 'NY'
  WHEN session = 'Oceania' THEN 'OCEANIA'
  WHEN session = 'Asia' THEN 'ASIA'
  WHEN session = 'London' THEN 'LONDON'
  ELSE session
END
WHERE session IN ('NewYork', 'Oceania', 'Asia', 'London');