-- Tabela de operações (histórico de trades)
CREATE TABLE IF NOT EXISTS public.operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry_price DECIMAL(18,8) NOT NULL,
  exit_price DECIMAL(18,8),
  stop_loss DECIMAL(18,8) NOT NULL,
  take_profit DECIMAL(18,8) NOT NULL,
  risk_reward DECIMAL(10,2) NOT NULL,
  result TEXT CHECK (result IN ('WIN', 'LOSS', 'BREAK_EVEN', 'OPEN')),
  pnl DECIMAL(18,8) DEFAULT 0,
  agents JSONB,
  session TEXT CHECK (session IN ('OCEANIA', 'ASIA', 'LONDON', 'NY')),
  entry_time TIMESTAMPTZ DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de metas diárias
CREATE TABLE IF NOT EXISTS public.daily_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  total_operations INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  target_operations INT DEFAULT 45,
  max_losses INT DEFAULT 15,
  total_pnl DECIMAL(18,8) DEFAULT 0,
  projected_completion_time TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de posições ativas
CREATE TABLE IF NOT EXISTS public.active_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset TEXT NOT NULL UNIQUE,
  direction TEXT NOT NULL CHECK (direction IN ('BUY', 'SELL')),
  entry_price DECIMAL(18,8) NOT NULL,
  current_price DECIMAL(18,8),
  stop_loss DECIMAL(18,8) NOT NULL,
  take_profit DECIMAL(18,8) NOT NULL,
  risk_reward DECIMAL(10,2) NOT NULL,
  current_pnl DECIMAL(18,8) DEFAULT 0,
  projected_profit DECIMAL(18,8) NOT NULL,
  agents JSONB,
  session TEXT CHECK (session IN ('OCEANIA', 'ASIA', 'LONDON', 'NY')),
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de logs dos agentes
CREATE TABLE IF NOT EXISTS public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  asset TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ANALYZING', 'SIGNAL', 'WAITING', 'REJECTED', 'ERROR')),
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de configurações do usuário
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  balance DECIMAL(18,8) NOT NULL DEFAULT 10000,
  risk_per_trade DECIMAL(5,4) DEFAULT 0.06,
  max_positions INT DEFAULT 3,
  bot_status TEXT DEFAULT 'stopped' CHECK (bot_status IN ('stopped', 'running', 'paused')),
  paper_mode BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (públicas para simplicidade inicial - ajustar depois se adicionar auth)
CREATE POLICY "Allow all operations on operations" ON public.operations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on daily_goals" ON public.daily_goals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on active_positions" ON public.active_positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on agent_logs" ON public.agent_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on user_settings" ON public.user_settings FOR ALL USING (true) WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_active_positions_updated_at
    BEFORE UPDATE ON public.active_positions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON public.user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Inserir configuração inicial
INSERT INTO public.user_settings (balance, risk_per_trade, max_positions, bot_status, paper_mode)
VALUES (10000, 0.06, 3, 'stopped', true)
ON CONFLICT DO NOTHING;

-- Inserir meta do dia atual
INSERT INTO public.daily_goals (date, target_operations, max_losses)
VALUES (CURRENT_DATE, 45, 15)
ON CONFLICT (date) DO NOTHING;