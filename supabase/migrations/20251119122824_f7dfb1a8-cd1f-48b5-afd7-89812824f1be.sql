-- ============================================
-- FASE 2: SISTEMA HÍBRIDO - Tabelas
-- ============================================

-- Tabela strategy_config: Gerenciar múltiplas estratégias
CREATE TABLE IF NOT EXISTS strategy_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  strategy_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1,
  market_conditions TEXT[],
  max_positions INTEGER DEFAULT 1,
  min_confidence_score NUMERIC DEFAULT 70,
  risk_per_trade_multiplier NUMERIC DEFAULT 1.0,
  allowed_sessions TEXT[],
  preferred_pairs TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_config_user_active ON strategy_config(user_id, is_active);

-- RLS para strategy_config
ALTER TABLE strategy_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own strategy config"
  ON strategy_config FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own strategy config"
  ON strategy_config FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own strategy config"
  ON strategy_config FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own strategy config"
  ON strategy_config FOR DELETE
  USING (auth.uid() = user_id);

-- Tabela market_conditions: Condições de mercado em tempo real
CREATE TABLE IF NOT EXISTS market_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  trend_direction TEXT,
  volatility_score NUMERIC,
  volume_profile TEXT,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  analysis_data JSONB
);

CREATE INDEX IF NOT EXISTS idx_market_conditions_recent ON market_conditions(user_id, asset, detected_at DESC);

-- RLS para market_conditions
ALTER TABLE market_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own market conditions"
  ON market_conditions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own market conditions"
  ON market_conditions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own market conditions"
  ON market_conditions FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FASE 3: PROTEÇÃO ANTI-PREJUÍZO - Tabelas
-- ============================================

-- Tabela risk_management_state: Estado do gerenciamento de risco
CREATE TABLE IF NOT EXISTS risk_management_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  current_risk_multiplier NUMERIC DEFAULT 1.0,
  consecutive_losses INTEGER DEFAULT 0,
  consecutive_wins INTEGER DEFAULT 0,
  last_5_ops_winrate NUMERIC DEFAULT 0,
  daily_drawdown_percent NUMERIC DEFAULT 0,
  mode TEXT DEFAULT 'NORMAL',
  cooldown_until TIMESTAMPTZ,
  last_trade_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_management_user ON risk_management_state(user_id);

-- RLS para risk_management_state
ALTER TABLE risk_management_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own risk management state"
  ON risk_management_state FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own risk management state"
  ON risk_management_state FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own risk management state"
  ON risk_management_state FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- FASE 4: MONITORAMENTO - Tabelas
-- ============================================

-- Tabela performance_metrics: Métricas de performance em tempo real
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  signals_detected INTEGER DEFAULT 0,
  signals_executed INTEGER DEFAULT 0,
  signals_expired INTEGER DEFAULT 0,
  signals_rejected INTEGER DEFAULT 0,
  total_operations INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  total_pnl NUMERIC DEFAULT 0,
  max_drawdown NUMERIC DEFAULT 0,
  avg_rr NUMERIC DEFAULT 0,
  best_strategy TEXT,
  worst_strategy TEXT,
  strategy_performance JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_performance_metrics_user_date ON performance_metrics(user_id, date);

-- RLS para performance_metrics
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own performance metrics"
  ON performance_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own performance metrics"
  ON performance_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own performance metrics"
  ON performance_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- Tabela system_alerts: Alertas do sistema
CREATE TABLE IF NOT EXISTS system_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  alert_type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity INTEGER DEFAULT 1,
  is_read BOOLEAN DEFAULT false,
  action_required BOOLEAN DEFAULT false,
  action_url TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_recent ON system_alerts(user_id, created_at DESC, is_read);

-- RLS para system_alerts
ALTER TABLE system_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own system alerts"
  ON system_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own system alerts"
  ON system_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own system alerts"
  ON system_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own system alerts"
  ON system_alerts FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- FASE 5: OTIMIZAÇÕES - Adicionar campo active_strategies
-- ============================================

ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS active_strategies TEXT[] DEFAULT ARRAY['FVG_MULTI_TF'];