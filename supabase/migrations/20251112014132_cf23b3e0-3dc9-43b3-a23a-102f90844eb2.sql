-- Remover posições duplicadas (mantém apenas a mais recente por user_id e asset)
DELETE FROM active_positions a
USING active_positions b
WHERE a.user_id = b.user_id 
  AND a.asset = b.asset 
  AND a.opened_at < b.opened_at;

-- Adicionar constraint única para evitar duplicatas
ALTER TABLE active_positions 
ADD CONSTRAINT unique_user_asset UNIQUE (user_id, asset);