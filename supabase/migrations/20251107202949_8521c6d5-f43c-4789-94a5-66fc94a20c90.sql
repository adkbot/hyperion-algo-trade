-- Adicionar campo para meta de P&L percentual na tabela daily_goals
ALTER TABLE daily_goals 
ADD COLUMN IF NOT EXISTS target_pnl_percent numeric DEFAULT 4.0;

-- Adicionar comentário explicativo
COMMENT ON COLUMN daily_goals.target_pnl_percent IS 'Meta diária de lucro em percentual (padrão 4%)';
