-- Criar trigger para atualizar daily_goals automaticamente ao fechar operações
CREATE TRIGGER update_daily_goals_trigger
  AFTER UPDATE ON operations
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_goals_on_operation_close();