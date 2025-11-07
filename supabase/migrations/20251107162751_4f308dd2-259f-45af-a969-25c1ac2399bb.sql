-- FASE 1: Limpar dados órfãos (sem user_id)
-- Isso remove todos os registros criados antes da implementação multi-usuário

DELETE FROM agent_logs WHERE user_id IS NULL;
DELETE FROM session_history WHERE user_id IS NULL;
DELETE FROM active_positions WHERE user_id IS NULL;
DELETE FROM operations WHERE user_id IS NULL;
DELETE FROM daily_goals WHERE user_id IS NULL;

-- FASE 2: Configurar paper_mode para testes
-- Garantir que todos os usuários comecem em modo paper
UPDATE user_settings SET paper_mode = true WHERE paper_mode = false;

-- FASE 3: Atualizar saldo inicial para testes (opcional, ajustar conforme necessário)
-- Apenas para usuários com saldo muito baixo
UPDATE user_settings SET balance = 10000 WHERE balance < 100;