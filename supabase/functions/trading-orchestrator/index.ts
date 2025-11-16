import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { detectEngulfingAfterSweep } from './sweep-engulfing.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ============================================
// 🧪 FASE 5: MODO TESTE CONTROLADO
// ============================================
const TEST_MODE = {
  enabled: true,
  maxTrades: 10,         // Máximo 10 trades de teste
  minConfidence: 0.70,   // Só trades com 70%+ confiança
  logEverything: true    // Logs detalhados
};

// Agent Functions URLs (Local Edge Functions)
const AGENTE_FEEDBACK_URL = `${SUPABASE_URL}/functions/v1/agente-feedback-analitico`;
const AGENTE_EXECUCAO_URL = `${SUPABASE_URL}/functions/v1/agente-execucao-confluencia`;
const AGENTE_GESTAO_URL = `${SUPABASE_URL}/functions/v1/agente-gestao-risco`;

// ============================================
// FASE 4: RATE LIMITER GLOBAL
// ============================================
class BinanceRateLimiter {
  private requests: number[] = [];
  private readonly maxRequestsPerMinute = 1000; // 80% do limite da Binance (1200)
  
  async checkAndWait(): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remover requisições antigas (fora da janela de 1 minuto)
    this.requests = this.requests.filter(timestamp => timestamp > oneMinuteAgo);
    
    // Se atingiu limite, aguardar
    if (this.requests.length >= this.maxRequestsPerMinute) {
      const oldestRequest = this.requests[0];
      const waitTime = (oldestRequest + 60000) - now;
      
      console.log(`⏳ RATE LIMIT - Aguardando ${Math.ceil(waitTime / 1000)}s para próxima janela`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Registrar requisição
    this.requests.push(now);
  }
  
  getStats() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.requests.filter(timestamp => timestamp > oneMinuteAgo);
    
    return {
      current: recentRequests.length,
      max: this.maxRequestsPerMinute,
      percentage: (recentRequests.length / this.maxRequestsPerMinute) * 100,
    };
  }
}

const rateLimiter = new BinanceRateLimiter();

// ============================================
// FASE 3: CACHE DE PARES (TTL: 15 minutos) - OTIMIZADO
// ============================================
let cachedPairs: string[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutos (otimizado)

// ============================================
// 🔵 FASE 4: CALCULAR RISCO ADAPTATIVO
// ============================================
function calculateAdaptiveRisk(baseRisk: number, dailyGoals: any): number {
  if (!dailyGoals) return baseRisk;
  
  const consecutiveLosses = dailyGoals.losses - dailyGoals.wins;
  
  // Reduzir risco após losses consecutivos
  if (consecutiveLosses >= 4) {
    console.log(`🚨 4+ losses consecutivos - Reduzindo risco para 25%`);
    return baseRisk * 0.25; // 6% → 1.5%
  } else if (consecutiveLosses >= 2) {
    console.log(`⚠️ 2+ losses consecutivos - Reduzindo risco para 50%`);
    return baseRisk * 0.5; // 6% → 3%
  }
  
  return baseRisk;
}

// ============================================
// 🔵 FASE 4: MONITORAR POSIÇÕES ATIVAS (MOMENTUM AVANÇADO)
// ============================================
async function monitorActivePositionsAdvanced(supabase: any, userId: string): Promise<void> {
  const { data: positions } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userId);
    
  if (!positions || positions.length === 0) return;
  
  for (const pos of positions) {
    if (!pos.current_price || !pos.entry_price) continue;
    
    // Determinar qual analyzer usar baseado na estratégia
    const strategy = (pos.agents as any)?.strategy || 'SCALPING_1MIN';
    
    let analyzer;
    if (strategy === 'FIRST_CANDLE_RULE') {
      // Usar analyzer do First Candle
      analyzer = await import('./first-candle-momentum-analyzer.ts');
    } else {
      // Usar analyzer padrão (SCALPING_1MIN)
      analyzer = await import('./scalping-1min-momentum-analyzer.ts');
    }
    
    const { calculateCurrentRR, shouldClosePosition } = analyzer;
    
    // CALCULAR RR ATUAL
    const rr = calculateCurrentRR(pos);
    
    console.log(`📊 Monitorando ${pos.asset} [${strategy}]: RR atual = ${rr.toFixed(2)}`);
    
    // ZONA DE PROTEÇÃO: 1.0 - 1.5 RR
    if (rr >= 1.0 && rr <= 1.5) {
      console.log(`🔍 ZONA DE PROTEÇÃO ATIVADA - Analisando momentum...`);
      
      // Analisar se deve fechar (o analyzer cuida de buscar os candles)
      const decision = await shouldClosePosition(pos);
      
      if (decision.shouldClose) {
        console.log(`🚨 FECHAMENTO ANTECIPADO [${strategy}]: ${decision.reason}`);
        
        // Chamar edge function para fechar posição
        const { data: closeData, error: closeError } = await supabase.functions.invoke('binance-close-order', {
          body: { user_id: userId, position_id: pos.id }
        });
        
        if (closeError) {
          console.error(`❌ Erro ao fechar posição ${pos.asset}:`, closeError);
        } else {
          console.log(`✅ Posição ${pos.asset} fechada com lucro em RR ${rr.toFixed(2)}`);
          console.log(`💰 P&L: $${pos.current_pnl?.toFixed(2) || 'N/A'}`);
        }
      } else {
        console.log(`✅ Mantendo posição: ${decision.reason}`);
      }
    }
    
    // Se RR > 1.5, continuar até target 3:1 (sem intervenção)
    if (rr > 1.5) {
      console.log(`🎯 RR ${rr.toFixed(2)} - Mantendo até target 3:1`);
    }
    
    // Se RR < 1.0, ainda não atingiu zona de proteção
    if (rr < 1.0) {
      console.log(`⏳ RR ${rr.toFixed(2)} - Aguardando zona de proteção (1.0+)`);
    }
  }
}

// ✅ FASE 6: R:R ranges por sessão e tipo de operação
const RR_RANGES = {
  OCEANIA_CONFIRMATION: { min: 1.15, max: 1.4 },
  ASIA_CONFIRMATION: { min: 1.2, max: 1.5 },
  ASIA_REVERSAL: { min: 1.25, max: 1.6 },
  LONDON_SCALP: { min: 1.15, max: 1.3 },
  NY_BREAKOUT: { min: 1.3, max: 1.8 },
  NY_REENTRY: { min: 1.2, max: 1.5 },
};

// ✅ FLEXIBILIZAÇÃO: Configuração de sensibilidade por sessão
const SENSITIVITY_CONFIG = {
  OCEANIA: {
    sweep: 'MEDIUM' as const,
    m1Confirmation: 'MODERATE' as const,
    minRR: 2.0,
    requireVolume: true,
  },
  ASIA: {
    sweep: 'MEDIUM' as const,
    m1Confirmation: 'MODERATE' as const,
    minRR: 2.0,
    requireVolume: true,
  },
  LONDON: {
    sweep: 'HIGH' as const,
    m1Confirmation: 'WEAK' as const,
    minRR: 1.8,
    requireVolume: false,
  },
  NY: {
    sweep: 'HIGH' as const,
    m1Confirmation: 'MODERATE' as const,
    minRR: 2.0,
    requireVolume: true,
  },
};

// ✅ R:R Dinâmico baseado em tipo de sweep e confirmação
const DYNAMIC_RR_MAP: Record<string, number> = {
  'TOTAL_STRONG': 1.8,
  'TOTAL_MODERATE': 2.0,
  'TOTAL_WEAK': 2.2,
  'PARTIAL_STRONG': 2.2,
  'PARTIAL_MODERATE': 2.5,
  'PARTIAL_WEAK': 2.8,
  'NEAR_STRONG': 2.8,
  'NEAR_MODERATE': 3.0,
  'NEAR_WEAK': 3.5,
};

// ✅ Session time ranges in UTC - 7 sessões de mercado detalhadas
const SESSIONS = {
  WELLINGTON: { start: 21, end: 22.9, name: 'WELLINGTON' },    // 21:00-22:54 UTC
  SYDNEY: { start: 23, end: 0.9, name: 'SYDNEY' },             // 23:00-00:54 UTC (next day)
  TOKYO: { start: 0, end: 1.9, name: 'TOKYO' },                // 00:00-01:54 UTC
  HONG_KONG: { start: 1.5, end: 2.9, name: 'HONG_KONG' },     // 01:30-02:54 UTC
  SINGAPORE: { start: 1, end: 2.9, name: 'SINGAPORE' },        // 01:00-02:54 UTC
  LONDON: { start: 8, end: 13.4, name: 'LONDON' },             // 08:00-13:24 UTC
  NY: { start: 13.5, end: 21.4, name: 'NY' },                  // 13:30-21:24 UTC (com DST)
};

// Map direction from LONG/SHORT to BUY/SELL for database
function mapDirection(signal: string): 'BUY' | 'SELL' {
  return signal === 'LONG' ? 'BUY' : 'SELL';
}

// REMOVED: mapSession() function - no longer needed as detectCurrentSession() now returns standardized names directly

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ⏱️ SISTEMA DE CONTROLE DE TEMPO - Limite de 50s para completar antes do timeout do cliente (90s)
  const MAX_EXECUTION_TIME_MS = 50000; // 50s (margem para timeout de 90s no cliente)
  const startTime = Date.now();
  
  function getRemainingTime(): number {
    const elapsed = Date.now() - startTime;
    return MAX_EXECUTION_TIME_MS - elapsed;
  }
  
  function shouldContinueAnalysis(): boolean {
    const remaining = getRemainingTime();
    const avgTimePerPair = 3500; // ~3.5s por par (baseado em histórico)
    return remaining > (avgTimePerPair * 1.5); // Margem de segurança
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ✅ MULTI-USER: Buscar TODOS os usuários com bot rodando
    const { data: activeUsers, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('bot_status', 'running');

    if (settingsError || !activeUsers || activeUsers.length === 0) {
      console.log('No active bots running');
      return new Response(
        JSON.stringify({ message: 'No active bots running', success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    console.log('='.repeat(80));
    console.log(`🤖 MULTI-USER BOT - Processing ${activeUsers.length} active user(s)...`);
    
    // Detect current session and cycle phase
    const currentSession = detectCurrentSession();
    const cyclePhase = getCyclePhase(currentSession);
    
    console.log(`📊 Current Session: ${currentSession}, Phase: ${cyclePhase}`);
    console.log(`🤖 AI Agents: ✅ ENABLED (3 agents active)`);
    console.log('='.repeat(80));

    // ✅ MULTI-USER: Processar cada usuário individualmente
    const allResults: any[] = [];
    let totalPairsAnalyzed = 0;

    for (const userSettings of activeUsers) {
      console.log(`\n👤 Processing user: ${userSettings.user_id}`);
      console.log(`💰 Balance: $${userSettings.balance} | Risk: ${(userSettings.risk_per_trade * 100).toFixed(1)}%`);
      console.log(`📈 Max Positions: ${userSettings.max_positions}`);

      try {
        const userResult = await processUserTradingCycle(
          supabase, 
          userSettings, 
          currentSession, 
          cyclePhase,
          getRemainingTime,
          shouldContinueAnalysis
        );
        allResults.push(userResult);
        totalPairsAnalyzed += userResult.pairsAnalyzed || 0;
      } catch (userError) {
        console.error(`❌ Error processing user ${userSettings.user_id}:`, userError);
        allResults.push({
          user_id: userSettings.user_id,
          error: userError instanceof Error ? userError.message : 'Unknown error'
        });
      }
    }

    // ⏱️ PERFORMANCE REPORT
    const totalTime = Date.now() - startTime;
    const utilizationPct = (totalTime / 60000) * 100;
    
    // 🟣 FASE 5: MÉTRICAS DE VALIDAÇÃO
    const metricsLog = `
⏱️ PERFORMANCE REPORT:
├─ Tempo total: ${totalTime}ms (${utilizationPct.toFixed(1)}% do limite de 60s)
├─ Pares analisados: ${totalPairsAnalyzed}
├─ Tempo médio/par: ${totalPairsAnalyzed > 0 ? (totalTime / totalPairsAnalyzed).toFixed(0) : 'N/A'}ms
├─ Utilização: ${utilizationPct < 90 ? '✅ SEGURO' : utilizationPct < 95 ? '⚠️ PRÓXIMO DO LIMITE' : '🔴 CRÍTICO'}
└─ Status: ${utilizationPct < 90 ? 'Tudo OK' : 'Considere reduzir pares ou otimizar'}
    `;
    
    console.log(metricsLog);
    
    // 🟣 FASE 5: CALCULAR MÉTRICAS DE TRADES (se houver resultados)
    if (allResults.length > 0 && allResults.some(r => r.analysis && r.analysis.length > 0)) {
      const totalTrades = allResults.reduce((sum, r) => sum + (r.analysis?.length || 0), 0);
      const successfulTrades = allResults.reduce((sum, r) => 
        sum + (r.analysis?.filter((a: any) => a.analysis?.signal !== 'STAY_OUT').length || 0), 0);
      
      console.log(`
📊 MÉTRICAS DE PERFORMANCE (Sessão):
├─ Trades executados: ${totalTrades}
├─ Sinais válidos: ${successfulTrades}
├─ Taxa de sinais: ${totalTrades > 0 ? ((successfulTrades / totalTrades) * 100).toFixed(1) : 0}%
${TEST_MODE.enabled ? `└─ 🧪 MODO TESTE: ${TEST_MODE.maxTrades} trades máximo, ${(TEST_MODE.minConfidence * 100).toFixed(0)}% confiança mínima` : ''}
      `);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        session: currentSession,
        phase: cyclePhase,
        users_processed: activeUsers.length,
        results: allResults,
        performance: {
          total_time_ms: totalTime,
          utilization_pct: utilizationPct,
          pairs_analyzed: totalPairsAnalyzed,
          avg_time_per_pair_ms: totalPairsAnalyzed > 0 ? Math.round(totalTime / totalPairsAnalyzed) : null
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in trading-orchestrator:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ✅ FASE 1: Session State Management
async function getSessionState(supabase: any, userId: string): Promise<any> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('session_state')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
    console.error('Error fetching session state:', error);
    return null;
  }
  
  return data;
}

async function updateSessionState(supabase: any, userId: string, updates: any): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Try to update first
  const { error: updateError } = await supabase
    .from('session_state')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('date', today);
  
  // If no rows updated, insert new
  if (updateError) {
    await supabase
      .from('session_state')
      .insert({
        user_id: userId,
        date: today,
        ...updates
      });
  }
  
  console.log(`✅ Session state updated: ${Object.keys(updates).join(', ')}`);
}

// ✅ BUFFER: Verificar se estamos na janela operacional
function isInOperatingWindow(session: string): { canOperate: boolean; message: string } {
  // 🚨 ETAPA 1: MODO DE TESTE - BUFFER DESABILITADO
  console.log(`✅ TESTE: Buffer temporariamente desabilitado - Operação permitida`);
  return { canOperate: true, message: '✅ TESTE: Buffer desabilitado' };
  
  /* CÓDIGO ORIGINAL (REATIVAR APÓS VALIDAÇÃO):
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  
  let sessionStart: number;
  let sessionEnd: number;
  
  switch(session) {
    case 'Oceania':
      sessionStart = 0;
      sessionEnd = 180;
      break;
    case 'Asia':
      sessionStart = 180;
      sessionEnd = 480;
      break;
    case 'London':
      sessionStart = 480;
      sessionEnd = 780;
      break;
    case 'NewYork':
      sessionStart = 780;
      sessionEnd = 1440;
      break;
    default:
      return { canOperate: false, message: 'Unknown session' };
  }
  
  const BUFFER_START = 30; // 2 velas x 15min
  const BUFFER_END = 60;   // 4 velas x 15min
  
  const minutesIntoSession = utcMinutes - sessionStart;
  const sessionDuration = sessionEnd - sessionStart;
  
  // ❌ Pular 2 primeiras velas (30 min)
  if (minutesIntoSession < BUFFER_START) {
    const remaining = BUFFER_START - minutesIntoSession;
    return { 
      canOperate: false, 
      message: `⏸️ BUFFER INICIAL - Aguardando análise de tendência (${remaining} min restantes)` 
    };
  }
  
  // ❌ Pular 4 últimas velas (60 min)
  if (minutesIntoSession > sessionDuration - BUFFER_END) {
    const inTransition = minutesIntoSession - (sessionDuration - BUFFER_END);
    return { 
      canOperate: false, 
      message: `⏸️ BUFFER FINAL - Transição para próxima sessão (${inTransition} min em transição)` 
    };
  }
  
  return { canOperate: true, message: '✅ Janela operacional ativa' };
  */
}

// ==========================================
// 🔵 PENDING SIGNALS SYSTEM
// ==========================================

/**
 * Salvar sinal pendente no banco para execução futura
 */
async function savePendingSignal(
  supabase: any,
  userId: string,
  asset: string,
  strategy: string,
  session: string,
  analysis: any
): Promise<void> {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutos
  
  await supabase.from('pending_signals').insert({
    user_id: userId,
    asset,
    strategy,
    session,
    direction: analysis.signal,
    entry_price: analysis.entryPrice || analysis.risk?.entry,
    stop_loss: analysis.stopLoss || analysis.risk?.stop,
    take_profit: analysis.takeProfit || analysis.risk?.target,
    risk_reward: analysis.riskReward || analysis.risk?.rr_ratio,
    confidence_score: analysis.confidence,
    agents: analysis.marketData,
    signal_data: {
      notes: analysis.notes,
      confirmation: analysis.confirmation,
      volumeFactor: analysis.volumeFactor,
      rangeHigh: analysis.rangeHigh,
      rangeLow: analysis.rangeLow,
    },
    status: 'PENDING',
    expires_at: expiresAt.toISOString(),
  });
  
  console.log(`✅ Sinal pendente salvo: ${asset} ${analysis.signal} @ ${analysis.entryPrice || analysis.risk?.entry}`);
}

/**
 * Executar sinais pendentes ainda válidos
 */
async function executePendingSignals(
  supabase: any,
  userId: string,
  settings: any,
  currentSession: string
): Promise<number> {
  try {
    // Buscar sinais pendentes não expirados
    const { data: pendingSignals, error } = await supabase
      .from('pending_signals')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .eq('session', currentSession)
      .gt('expires_at', new Date().toISOString())
      .order('detected_at', { ascending: true });
    
    if (error || !pendingSignals || pendingSignals.length === 0) {
      return 0;
    }
    
    console.log(`\n📋 ${pendingSignals.length} sinal(is) pendente(s) encontrado(s)`);
    
    let executed = 0;
    
    for (const signal of pendingSignals) {
      console.log(`\n🔄 Processando sinal pendente: ${signal.asset} ${signal.direction}`);
      
      // Verificar se ainda não há posição ativa
      const { data: activePositions } = await supabase
        .from('active_positions')
        .select('*')
        .eq('user_id', userId)
        .eq('asset', signal.asset);
      
      if (activePositions && activePositions.length > 0) {
        console.log(`⚠️ Já existe posição ativa em ${signal.asset} - Cancelando sinal pendente`);
        await supabase
          .from('pending_signals')
          .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
          .eq('id', signal.id);
        continue;
      }
      
      // Executar trade
      const analysisObject = {
        signal: signal.direction,
        risk: {
          entry: signal.entry_price,
          stop: signal.stop_loss,
          target: signal.take_profit,
          rr_ratio: signal.risk_reward,
        },
        confidence: signal.confidence_score,
        marketData: signal.agents || {},
      };
      
      const success = await executeTradeSignal(
        supabase,
        userId,
        signal.asset,
        analysisObject,
        settings,
        currentSession
      );
      
      if (success) {
        // Marcar como executado
        await supabase
          .from('pending_signals')
          .update({ 
            status: 'EXECUTED', 
            executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', signal.id);
        
        executed++;
        console.log(`✅ Sinal pendente executado: ${signal.asset} ${signal.direction}`);
      } else {
        console.log(`❌ Falha ao executar sinal pendente: ${signal.asset} ${signal.direction}`);
      }
    }
    
    // Expirar sinais antigos
    await supabase
      .from('pending_signals')
      .update({ status: 'EXPIRED', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'PENDING')
      .lt('expires_at', new Date().toISOString());
    
    return executed;
  } catch (error) {
    console.error('❌ Erro ao executar sinais pendentes:', error);
    return 0;
  }
}

// ✅ NOVA FUNÇÃO: Processar ciclo de trading para um usuário específico
async function processUserTradingCycle(
  supabase: any, 
  settings: any, 
  currentSession: string, 
  cyclePhase: string,
  getRemainingTime?: () => number,
  shouldContinueAnalysis?: () => boolean
) {
  const userId = settings.user_id;
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // ✅ LOGS DE DEBUG - CONFIGURAÇÃO DO USUÁRIO
  console.log(`
🔍 DEBUG - CONFIGURAÇÃO DO USUÁRIO:
├─ User ID: ${userId}
├─ Balance: $${settings.balance}
├─ Leverage: ${settings.leverage}x
├─ Profit Target: ${settings.profit_target_percent}%
├─ Max Positions: ${settings.max_positions}
├─ Single Position Mode: ${settings.single_position_mode ? 'ATIVO' : 'INATIVO'}
├─ Paper Mode: ${settings.paper_mode ? '📝 SIM (SIMULAÇÃO)' : '💰 NÃO (REAL)'}
├─ API Key: ${settings.api_key ? '✅ Configurada (***' + settings.api_key.slice(-4) + ')' : '❌ NÃO CONFIGURADA'}
├─ API Secret: ${settings.api_secret ? '✅ Configurada' : '❌ NÃO CONFIGURADA'}
└─ Bot Status: ${settings.bot_status}
  `);

  // 🔧 ETAPA 4: FORÇAR MODO STANDALONE PURO
  console.log(`🔧 MODO STANDALONE FORÇADO - Ignorando dependências de sessões anteriores`);
  const sessionState: any = null; // Forçar sempre modo standalone para teste
  
  
  // ✅ VERIFICAR BUFFER DE VELAS
  const bufferCheck = isInOperatingWindow(currentSession);
  
  // ✅ FASE 7: Log detalhado do estado
  console.log(`
📊 CYCLE START - User ${userId}
- UTC Time: ${now.toISOString()}
- Session: ${currentSession} (${cyclePhase})
- Trading Mode: ${sessionState?.c1_direction ? '🎯 FIMATHE' : '🔧 STANDALONE HÍBRIDO'}
- Operating Window: ${bufferCheck.message}
- Minutes into session: ${utcMinutes - (currentSession === 'Oceania' ? 0 : currentSession === 'Asia' ? 180 : currentSession === 'London' ? 480 : 780)}
- Session State: ${sessionState ? `✅ C1=${sessionState.c1_direction}` : '⚙️ Using Wyckoff + Volume Profile + IA'}
- Asia Status: ${sessionState?.asia_confirmation || 'N/A'}
- London Range: ${sessionState?.london_range_low || 'N/A'} - ${sessionState?.london_range_high || 'N/A'}
  `);

  // ✅ SE ESTAMOS NO BUFFER, NÃO OPERAR
  if (!bufferCheck.canOperate) {
    console.log(`🛑 Fora da janela operacional - Buffer ativo`);
    return {
      session: currentSession,
      phase: cyclePhase,
      analysis: [],
      activePositions: 0,
      message: bufferCheck.message
    };
  }

  // ✅ Check daily goals POR USUÁRIO
  const today = new Date().toISOString().split('T')[0];
  const { data: dailyGoal } = await supabase
    .from('daily_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('date', today)
    .single();

  // ✅ Recalcular projeção de tempo a cada ciclo
  if (dailyGoal && dailyGoal.total_operations > 0 && !dailyGoal.completed) {
    const startOfDayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const newProjection = await calculateProjectedCompletionTime(
      dailyGoal.total_operations,
      dailyGoal.target_operations || 45,
      startOfDayUTC
    );

    if (newProjection !== dailyGoal.projected_completion_time) {
      await supabase
        .from('daily_goals')
        .update({ projected_completion_time: newProjection })
        .eq('id', dailyGoal.id);
      console.log(`🔄 Projeção atualizada: ${newProjection ? new Date(newProjection).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}`);
    }
  }

  // ============================================
  // 🎯 REGRA CRÍTICA: SÓ ABRE NOVA POSIÇÃO SE META FOI ATINGIDA
  // ============================================
  if (dailyGoal && dailyGoal.completed) {
    console.log(`🎯 META DIÁRIA JÁ ATINGIDA! Aguardando próximo dia...`);
    console.log(`├─ Total PNL: $${dailyGoal.total_pnl}`);
    console.log(`├─ Operações: ${dailyGoal.total_operations}`);
    console.log(`└─ Win Rate: ${dailyGoal.total_operations > 0 ? ((dailyGoal.wins / dailyGoal.total_operations) * 100).toFixed(1) : 0}%`);
    
    return {
      userId,
      status: 'daily_goal_completed',
      activePositions: 0,
      message: 'Meta diária atingida - aguardando próximo dia',
      pairsAnalyzed: 0 // ⏱️ Nenhum par analisado (meta já atingida)
    };
  }

  // ==========================================
  // 🚀 EXECUTAR PENDING SIGNALS PRIMEIRO
  // ==========================================
  console.log(`\n🔍 Verificando sinais pendentes...`);
  const executedSignals = await executePendingSignals(
    supabase,
    userId,
    settings,
    currentSession
  );
  
  if (executedSignals > 0) {
    console.log(`✅ ${executedSignals} sinal(is) pendente(s) executado(s)`);
  }

  // Check active positions DEPOIS de executar pending signals
  const { data: activePositions } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userId);

  const activeCount = activePositions?.length || 0;

  // ============================================
  // ⏰ BUSCAR CONFIGURAÇÃO DE TIMER DE COOLDOWN
  // ============================================
  const { data: currentSettings } = await supabase
    .from('user_settings')
    .select('cooldown_disabled_until')
    .eq('user_id', userId)
    .single();

  // ============================================
  // 🔴 FASE 1: COOLDOWN INTELIGENTE (NÃO BLOQUEIO PERMANENTE)
  // ============================================
  if (dailyGoal && dailyGoal.total_operations > 0 && !dailyGoal.completed && activeCount === 0) {
    // Obter última operação com LOSS para calcular tempo desde o último loss
    const { data: operations } = await supabase
      .from('operations')
      .select('exit_time')
      .eq('user_id', userId)
      .eq('result', 'LOSS')  // ✅ CORRIGIDO: Filtrar apenas LOSS
      .order('exit_time', { ascending: false })
      .limit(1);

    const lastLossTime = operations?.[0]?.exit_time;
    const hoursSinceLastLoss = lastLossTime 
      ? (Date.now() - new Date(lastLossTime).getTime()) / (1000 * 60 * 60)
      : 999; // Se não houver operação, liberar

    // Verificar se é um novo dia UTC
    const isNewDay = new Date().getUTCDate() !== new Date(dailyGoal.date).getUTCDate();

    if (isNewDay) {
      console.log(`🔄 NOVO DIA DETECTADO - Sistema desbloqueado automaticamente`);
      console.log(`├─ Data anterior: ${dailyGoal.date}`);
      console.log(`└─ Data atual: ${new Date().toISOString().split('T')[0]}`);
      
      // Resetar daily goals para novo dia
      await supabase
        .from('daily_goals')
        .update({
          total_operations: 0,
          wins: 0,
          losses: 0,
          total_pnl: 0,
          completed: false
        })
        .eq('user_id', userId)
        .eq('id', dailyGoal.id);
      
      // Continuar análise normalmente
    } else if (hoursSinceLastLoss < 4 && (!currentSettings?.cooldown_disabled_until || new Date() >= new Date(currentSettings.cooldown_disabled_until))) {
      // ✅ Cooldown de 4h após loss (respeitando timer de desabilitação)
      console.log(`⏸️ COOLDOWN ATIVO - Aguardando ${(4 - hoursSinceLastLoss).toFixed(1)}h para retomar`);
      console.log(`├─ Total PNL: $${dailyGoal.total_pnl}`);
      console.log(`├─ Operações: ${dailyGoal.total_operations} (${dailyGoal.wins}W/${dailyGoal.losses}L)`);
      console.log(`└─ Último loss: ${new Date(lastLossTime).toLocaleTimeString('pt-BR')}`);
      
      return {
        userId,
        status: 'cooldown',
        activePositions: 0,
        message: `Cooldown ativo: ${(4 - hoursSinceLastLoss).toFixed(1)}h restantes`,
        pairsAnalyzed: 0
      };
    } else {
      // Cooldown expirado, liberar sistema
      console.log(`✅ COOLDOWN EXPIRADO - Sistema liberado para novas operações`);
      console.log(`├─ Tempo desde último loss: ${hoursSinceLastLoss.toFixed(1)}h`);
      console.log(`└─ Limite de cooldown: 4h`);
    }
  }

  // ============================================
  // ⏰ PROCESSAR TIMER AUTOMÁTICO DE COOLDOWN
  // ============================================

  if (currentSettings?.cooldown_disabled_until) {
    const disabledUntil = new Date(currentSettings.cooldown_disabled_until);
    const now = new Date();
    
    if (now >= disabledUntil) {
      // Timer expirou, reabilitar cooldown automaticamente
      console.log(`⏰ TIMER AUTOMÁTICO: Reabilitando cooldown`);
      console.log(`├─ Desabilitado até: ${disabledUntil.toLocaleString('pt-BR')}`);
      console.log(`├─ Hora atual: ${now.toLocaleString('pt-BR')}`);
      console.log(`└─ Cooldown reabilitado automaticamente ✅`);
      
      // Limpar flag de desabilitação
      await supabase
        .from('user_settings')
        .update({ cooldown_disabled_until: null })
        .eq('user_id', userId);
      
      // Registrar no log de agentes
      await supabase.from('agent_logs').insert({
        user_id: userId,
        agent_name: 'SYSTEM_COOLDOWN',
        status: 'SUCCESS',
        asset: 'SYSTEM',
        data: {
          action: 'cooldown_reativado',
          disabled_duration_hours: 24,
          reactivated_at: now.toISOString(),
          message: 'Cooldown reabilitado automaticamente após 24h'
        }
      });
    } else {
      // Timer ainda ativo
      const hoursRemaining = (disabledUntil.getTime() - now.getTime()) / (1000 * 60 * 60);
      console.log(`⏰ TIMER ATIVO: Cooldown desabilitado por mais ${hoursRemaining.toFixed(1)}h`);
      console.log(`└─ Reabilitação automática em: ${disabledUntil.toLocaleString('pt-BR')}`);
    }
  }

  // ============================================
  // 💰 SINCRONIZAR SALDO COM BINANCE
  // ============================================
  console.log(`💰 Sincronizando saldo com Binance...`);
  try {
    const { data: balanceData, error: balanceError } = await supabase.functions.invoke('sync-binance-balance', {
      body: { user_id: userId }
    });

    if (balanceError) {
      console.error(`❌ Erro ao sincronizar saldo:`, balanceError);
    } else if (balanceData && balanceData.success) {
      console.log(`✅ Saldo sincronizado: $${balanceData.oldBalance.toFixed(2)} → $${balanceData.newBalance.toFixed(2)} (${balanceData.difference >= 0 ? '+' : ''}$${balanceData.difference.toFixed(2)})`);
    }
  } catch (balanceErr) {
    console.error(`❌ Falha ao chamar sync-binance-balance:`, balanceErr);
  }

  // ============================================
  // 🔄 SINCRONIZAR POSIÇÕES COM BINANCE
  // ============================================
  console.log(`🔄 Sincronizando posições com Binance...`);
  try {
    const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-binance-positions', {
      body: { user_id: userId }
    });

    if (syncError) {
      console.error(`❌ Erro ao sincronizar com Binance:`, syncError);
    } else if (syncData?.synced) {
      const { positions_count, added, updated, removed } = syncData;
      console.log(`✅ Sincronização completa: ${positions_count} posições ativas`);
      if (added > 0) console.log(`  ├─ 📥 Adicionadas: ${added} novas posições`);
      if (updated > 0) console.log(`  ├─ 🔄 Atualizadas: ${updated} posições`);
      if (removed > 0) console.log(`  └─ 🗑️ Removidas: ${removed} posições`);
    }
  } catch (syncError) {
    console.error(`❌ Erro na sincronização:`, syncError);
  }

  // Buscar posições novamente após sincronização
  const { data: syncedPositions } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userId);

  const syncedCount = syncedPositions?.length || 0;
  console.log(`💼 Posições ativas após sincronização: ${syncedCount}/${settings.max_positions}`);

  // ✅ Verificar meta diária: quantidade de operações
  const targetOperations = dailyGoal?.target_operations || 45;
  
  if (dailyGoal && dailyGoal.total_operations >= targetOperations) {
    console.log(`✅ META DIÁRIA DE ${targetOperations} OPERAÇÕES ATINGIDA para user ${userId}!`);
    console.log(`📊 Total: ${dailyGoal.total_operations} operações | P&L: $${dailyGoal.total_pnl}`);
    console.log(`📈 Performance: ${dailyGoal.wins} wins | ${dailyGoal.losses} losses`);
    
    await supabase.from('user_settings').update({ 
      bot_status: 'stopped' 
    }).eq('user_id', userId);
    
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Daily Goal Manager',
      asset: 'SYSTEM',
      status: 'success',
      data: {
        message: 'Meta diária de operações atingida',
        total_operations: dailyGoal.total_operations,
        target_operations: targetOperations,
        pnl: dailyGoal.total_pnl,
        wins: dailyGoal.wins,
        losses: dailyGoal.losses,
        win_rate: dailyGoal.total_operations > 0 ? ((dailyGoal.wins / dailyGoal.total_operations) * 100).toFixed(1) : 0,
      }
    });
    
    return { 
      message: 'Daily goal reached - bot stopped',
      operations: dailyGoal.total_operations,
      pnl: dailyGoal.total_pnl
    };
  }

  // ✅ Verificar perda máxima diária
  const maxLosses = dailyGoal?.max_losses || 15;
  
  if (dailyGoal && dailyGoal.losses >= maxLosses) {
    console.log(`⚠️ PERDA MÁXIMA ATINGIDA (${maxLosses} losses) para user ${userId}!`);
    
    await supabase.from('user_settings').update({ 
      bot_status: 'stopped' 
    }).eq('user_id', userId);
    
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Risk Manager',
      asset: 'SYSTEM',
      status: 'warning',
      data: {
        message: 'Perda máxima diária atingida',
        losses: dailyGoal.losses,
        max_losses: maxLosses,
        total_pnl: dailyGoal.total_pnl,
      }
    });
    
    return { 
      message: 'Max daily losses reached - bot stopped for protection',
      losses: dailyGoal.losses 
    };
  }

  // Monitor existing positions regardless of limit
  if (syncedPositions && syncedPositions.length > 0) {
    await monitorActivePositionsAdvanced(supabase, userId);
    
    // ✅ SINCRONIZAR AUTOMATICAMENTE com Binance a cada ciclo (modo real)
    if (!settings.paper_mode) {
      console.log(`🔄 Sincronizando ${syncedCount} posições com Binance...`);
      
      try {
        const autoSyncResponse = await supabase.functions.invoke('sync-binance-positions', {
          body: { user_id: userId }
        });
        
        if (autoSyncResponse.error) {
          console.error('⚠️ Erro na sincronização automática:', autoSyncResponse.error);
        } else if (autoSyncResponse.data?.synced) {
          console.log(`✅ Sincronização automática completa - ${autoSyncResponse.data.positions_count} posições`);
        }
      } catch (autoSyncError) {
        console.error('⚠️ Falha na sincronização automática:', autoSyncError);
      }
    }
  }

  // CRITICAL: If single_position_mode is enabled and there's ANY active position, stop here
  if (settings.single_position_mode && syncedCount > 0) {
    console.log(`⏸️ Modo 1 posição ativo - aguardando fechamento da posição atual`);
    return {
      userId,
      status: 'waiting_position_close',
      activePositions: syncedCount,
      message: 'Aguardando fechamento da posição ativa',
      pairsAnalyzed: 0 // ⏱️ Nenhum par analisado (aguardando fechamento)
    };
  }

  if (syncedCount >= settings.max_positions) {
    console.log(`⚠️ Limite de posições atingido (${settings.max_positions}). Monitorando posições existentes...`);
    
    return {
      userId,
      status: 'max_positions_reached',
      activePositions: syncedCount,
      message: `Limite de ${settings.max_positions} posições atingido`,
      pairsAnalyzed: 0 // ⏱️ Nenhum par analisado (limite atingido)
    };
  }

  // ✅ Scan market for valid pairs
  console.log('Scanning market for valid trading pairs...');
  const validPairs = await scanMarketForValidPairs(getRemainingTime);
  
  console.log(`Found ${validPairs.length} valid trading pairs: ${validPairs.join(', ')}`);

  // ✅ Análise de mercado para múltiplos pares COM BATCH PROCESSING E TIMEOUT PREVENTIVO (OTIMIZADO)
  const analysisResults: any[] = [];
  let pairsAnalyzed = 0;
  const BATCH_SIZE = 5; // 5 pares por batch
  const MAX_EXECUTION_TIME = 50000; // 50s limite interno
  const BATCH_TIMEOUT = 15000; // 15s por batch
  const orchestratorStartTime = Date.now();

  console.log(`\n🚀 INICIANDO ANÁLISE EM LOTE (OTIMIZADO):`);
  console.log(`├─ Total de pares: ${validPairs.length}`);
  console.log(`├─ Batch size: ${BATCH_SIZE} (reduzido)`);
  console.log(`├─ Timeout global: ${MAX_EXECUTION_TIME / 1000}s`);
  console.log(`├─ Timeout por batch: ${BATCH_TIMEOUT / 1000}s`);
  console.log(`└─ Max positions: ${settings.max_positions}\n`);

  for (let batchIndex = 0; batchIndex < validPairs.length; batchIndex += BATCH_SIZE) {
    // ⏱️ TIMEOUT PREVENTIVO GLOBAL: Verificar se excedeu 90s
    const elapsedTime = Date.now() - orchestratorStartTime;
    if (elapsedTime > MAX_EXECUTION_TIME) {
      console.log(`\n⏱️ TIMEOUT GLOBAL ATIVADO:`);
      console.log(`├─ Tempo decorrido: ${(elapsedTime / 1000).toFixed(1)}s`);
      console.log(`├─ Pares analisados: ${pairsAnalyzed}/${validPairs.length}`);
      console.log(`└─ Parando análise para evitar WORKER_LIMIT\n`);
      break;
    }

    // ⏱️ CHECKPOINT: Verificar shouldContinueAnalysis
    if (shouldContinueAnalysis && !shouldContinueAnalysis()) {
      console.log(`⏱️ EXTERNAL TIMEOUT: Analisados ${pairsAnalyzed}/${validPairs.length} pares. Parando.`);
      break;
    }

    const batch = validPairs.slice(batchIndex, batchIndex + BATCH_SIZE);
    const batchNum = Math.floor(batchIndex / BATCH_SIZE) + 1;
    const batchStartTime = Date.now();
    
    console.log(`\n📦 BATCH ${batchNum}/${Math.ceil(validPairs.length / BATCH_SIZE)}: ${batch.join(', ')}`);

    // Processar cada par do batch
    for (const pair of batch) {
      // ⏱️ TIMEOUT POR BATCH
      if (Date.now() - batchStartTime > BATCH_TIMEOUT) {
        console.log(`⏱️ BATCH TIMEOUT (15s): Pulando pares restantes do batch ${batchNum}`);
        break;
      }
        try {
          // ✅ VERIFICAR SE ATIVO JÁ TEM POSIÇÃO ABERTA
          const { data: existingPositionForAsset } = await supabase
            .from('active_positions')
            .select('id, asset')
            .eq('user_id', userId)
            .eq('asset', pair)
            .maybeSingle();
          
          if (existingPositionForAsset) {
            console.log(`⏸️ ${pair} já tem posição aberta - pulando análise (ID: ${existingPositionForAsset.id})`);
            continue;
          }
          
          // ✅ Verificar total de posições (limite global)
          const { data: currentPositions } = await supabase
            .from('active_positions')
            .select('id')
            .eq('user_id', userId);
          
          const currentCount = currentPositions?.length || 0;
          
          if (currentCount >= settings.max_positions) {
            console.log(`⏸️ Limite de ${settings.max_positions} posições atingido - parando scan`);
            break;
          }
          
          console.log(`📊 Posições ativas: ${currentCount}/${settings.max_positions} - ${pair} livre para análise ✅`);

          console.log(`Analyzing ${pair} - Session: ${currentSession}`);
          
          // Fetch candles
          const candles = await fetchCandlesFromBinance(pair, ['1m', '5m', '15m', '1h']);
          
          if (!candles['1m'] || !candles['5m'] || !candles['15m'] || !candles['1h']) {
            console.log(`❌ Insufficient candle data for ${pair}`);
            continue;
          }

          // ✅ ESCOLHER ESTRATÉGIA: First Candle Rule, Scalping 1Min ou Sweep de Liquidez
          const selectedStrategy = settings.trading_strategy || 'SWEEP_LIQUIDITY';
          console.log(`📊 Strategy selecionada: ${selectedStrategy} para ${pair}`);
          
          let analysis;
          
          if (selectedStrategy === 'FIRST_CANDLE_RULE') {
            // ESTRATÉGIA: First Candle Rule (Breakout → Reteste → Engulfing)
            const { analyzeFirstCandleRule } = await import('./first-candle-analyzer.ts');
            analysis = await analyzeFirstCandleRule({
              candles: { '1m': candles['1m'], '5m': candles['5m'] },
              asset: pair,
              userId,
              supabase
            });
          } else if (selectedStrategy === 'FIRST_CANDLE_ADK') {
            // 🎯 NOVA ESTRATÉGIA: First Candle ADK (15m Foundation + Multi-TF FVG)
            const { analyzeADKStrategy } = await import('./first-candle-adk-analyzer.ts');
            analysis = await analyzeADKStrategy({
              candles: { '1m': candles['1m'], '15m': candles['15m'] },
              asset: pair,
              userId,
              supabase
            });
          } else if (selectedStrategy === 'SCALPING_1MIN') {
            // ESTRATÉGIA: Scalping 1 Minuto (FVG)
            const { analyzeScalping1Min } = await import('./scalping-1min-analyzer.ts');
            analysis = await analyzeScalping1Min({
              candles: { '1m': candles['1m'], '5m': candles['5m'] },
              asset: pair,
              session: currentSession,
              userId,
              supabase
            });
          } else {
            // ESTRATÉGIA PADRÃO: SWEEP DE LIQUIDEZ + 2CR (TWO CANDLE REVERSAL)
            const { analyzeSweepWith2CR } = await import('./sweep-2cr-analyzer.ts');
            analysis = await analyzeSweepWith2CR({
              candles: { '1m': candles['1m'], '5m': candles['5m'] },
              asset: pair,
              userId,
              supabase
            });
          }

          if (analysis) {
            analysisResults.push({
              pair,
              ...analysis
            });

            // ✅ COOLDOWN: Verificar se já EXECUTAMOS uma ordem recente para este ativo (últimos 30 segundos)
            const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
            const { data: recentOrder } = await supabase
              .from('operations')
              .select('*')
              .eq('user_id', userId)
              .eq('asset', pair)
              .eq('direction', mapDirection(analysis.signal))
              .gte('created_at', thirtySecondsAgo)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();

            const shouldSkipDueToCooldown = recentOrder && analysis.signal !== 'STAY_OUT';
            
            if (shouldSkipDueToCooldown) {
              console.log(`⏸️ COOLDOWN: ${pair} teve ordem ${recentOrder.direction} há ${Math.round((Date.now() - new Date(recentOrder.created_at).getTime()) / 1000)}s - pulando`);
              continue;
            }

            // ✅ CORREÇÃO: Registrar TODAS as análises, não apenas sinais de trade
            const determineEventType = (signal: string, phase?: string): string => {
              if (phase === 'WAITING_FOUNDATION') return 'FOUNDATION_PENDING';
              if (phase === 'SESSION_FILTER_REJECTED') return 'SESSION_FILTER';
              if (phase === 'WAITING_FVG') return 'FVG_PENDING';
              if (phase === 'FVG_INVALID_SEQUENCE') return 'FVG_INVALID';
              if (phase === 'INVALID_THIRD_CANDLE_CLOSE') return 'THIRD_CANDLE_INVALID';
              if (phase === 'SESSION_LIMIT_REACHED') return 'SESSION_LIMIT';
              if (signal === 'BUY' || signal === 'SELL') return 'TRADE_SIGNAL';
              if (signal === 'STAY_OUT') return 'STAY_OUT';
              return 'ANALYSIS';
            };

            const { error: historyError } = await supabase
              .from('session_history')
              .insert({
                user_id: userId,
                session: currentSession,
                cycle_phase: cyclePhase,
                pair: pair,
                signal: analysis.signal,
                direction: analysis.signal === 'BUY' || analysis.signal === 'SELL' ? mapDirection(analysis.signal) : null,
                confidence_score: analysis.confidence || 0,
                notes: (analysis as any).notes || '',
                event_type: determineEventType(analysis.signal, (analysis as any).phase || cyclePhase),
                event_data: {
                  foundation: (analysis as any).foundation || null,
                  fvg: (analysis as any).fvg || null,
                  phase: (analysis as any).phase || cyclePhase,
                  entryPrice: (analysis as any).entryPrice || (analysis as any).entry || 0,
                  stopLoss: (analysis as any).stopLoss || (analysis as any).stop || 0,
                  takeProfit: (analysis as any).takeProfit || (analysis as any).target || 0,
                  riskReward: (analysis as any).riskReward || (analysis as any).rr_ratio || 0,
                  strategy: selectedStrategy,
                  marketData: (analysis as any).marketData || null
                },
                timestamp: new Date().toISOString(),
              });
            
            if (historyError) {
              console.error('❌ Error logging session_history:', historyError);
            } else {
              console.log(`✅ Logged ${analysis.signal} (${determineEventType(analysis.signal, (analysis as any).phase || cyclePhase)}) for ${pair} to session_history`);
            }

            // Execute trade if signal is valid
            console.log(`🔍 Verificando sinal de ${pair}: ${analysis?.signal} (type: ${typeof analysis?.signal})`);
            console.log(`   Risk object presente:`, (analysis as any)?.risk ? 'SIM' : 'NÃO');
            if ((analysis as any)?.risk) {
              console.log(`   Risk keys:`, Object.keys((analysis as any).risk));
            }
            
            if (analysis.signal === 'BUY' || analysis.signal === 'SELL') {
              console.log(`✅ SINAL VÁLIDO DETECTADO: ${analysis.signal} para ${pair}`);
              
              // Verificar se já existe posição para este ativo
              const { data: existingPosition } = await supabase
                .from('active_positions')
                .select('*')
                .eq('user_id', userId)
                .eq('asset', pair)
                .maybeSingle();

              if (existingPosition) {
                console.log(`⏸️ ${pair} já tem posição ativa (ID: ${existingPosition.id}) - pulando execução`);
                continue;
              }

              console.log(`📞 CHAMANDO executeTradeSignal para ${pair}...`);
              
              try {
                const success = await executeTradeSignal(
                  supabase,
                  userId,
                  pair,
                  analysis,
                  settings,
                  currentSession
                );
                
                // Se falhou, salvar como pending signal para próxima tentativa
                if (!success) {
                  console.log(`⚠️ Execução falhou - Salvando como pending signal`);
                  await savePendingSignal(
                    supabase,
                    userId,
                    pair,
                    settings.trading_strategy || 'SCALPING_1MIN',
                    currentSession,
                    analysis
                  );
                }
                
                console.log(`✅ executeTradeSignal completado para ${pair}`);
              } catch (execError) {
                console.error(`❌ ERRO em executeTradeSignal para ${pair}:`, execError);
                
                // Salvar como pending signal em caso de erro
                try {
                  await savePendingSignal(
                    supabase,
                    userId,
                    pair,
                    settings.trading_strategy || 'SCALPING_1MIN',
                    currentSession,
                    analysis
                  );
                } catch (saveError) {
                  console.error(`❌ Falha ao salvar pending signal:`, saveError);
                }
                
                if (execError instanceof Error) {
                  console.error(`   Stack:`, execError.stack);
                }
              }
            } else {
              console.log(`⏸️ Sinal ${analysis?.signal || 'undefined'} não é BUY nem SELL - pulando`);
            }
          }

          pairsAnalyzed++;
          
          // ⏱️ Checkpoint de timeout
          const elapsed = Date.now() - orchestratorStartTime;
          if (elapsed > MAX_EXECUTION_TIME) {
            console.log(`⏱️ TIMEOUT PREVENTIVO: ${elapsed}ms - Parando após ${pairsAnalyzed} pares`);
            break;
          }
        } catch (error) {
          console.error(`Error analyzing ${pair}:`, error);
        }
    } // fim do for pair of batch
    
    // ⏱️ Checkpoint de timeout após batch
    const elapsedAfterBatch = Date.now() - orchestratorStartTime;
    if (elapsedAfterBatch > MAX_EXECUTION_TIME) {
      console.log(`⏱️ TIMEOUT APÓS BATCH: ${elapsedAfterBatch}ms - Parando análise`);
      break;
    }
  } // fim do for batchIndex

  return {
    session: currentSession,
    phase: cyclePhase,
    analysis: analysisResults,
    activePositions: activePositions?.length || 0,
    pairsAnalyzed, // ⏱️ Incluir no retorno para tracking de performance
  };
}

// Detect current session based on UTC time
function detectCurrentSession(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcDecimal = utcHour + (utcMinutes / 60); // Hora em formato decimal (12:30 = 12.5)

  // ✅ BUFFERS DE TRANSIÇÃO (30min antes de cada sessão)
  // 02:30-03:00 (pré-Asia), 07:30-08:00 (pré-London), 12:30-13:00 (pré-NY), 23:30-00:00 (pré-Oceania)
  const inTransitionBuffer = 
    (utcDecimal >= 2.5 && utcDecimal < 3) ||    // 02:30-03:00
    (utcDecimal >= 7.5 && utcDecimal < 8) ||    // 07:30-08:00
    (utcDecimal >= 12.5 && utcDecimal < 13) ||  // 12:30-13:00
    (utcDecimal >= 23.5);                       // 23:30-00:00

  if (inTransitionBuffer) {
    let nextSession = '';
    if (utcDecimal >= 2.5 && utcDecimal < 3) nextSession = 'ASIA';
    else if (utcDecimal >= 7.5 && utcDecimal < 8) nextSession = 'LONDON';
    else if (utcDecimal >= 12.5 && utcDecimal < 13) nextSession = 'NY';
    else if (utcDecimal >= 23.5) nextSession = 'OCEANIA';
    
    console.log(`⏸️ Buffer de transição pré-${nextSession} em ${utcHour}:${utcMinutes.toString().padStart(2, '0')} UTC`);
    return 'TRANSITION';
  }

  // ✅ DETECTAR SESSÃO ATIVA (usando hora decimal para precisão)
  for (const [key, session] of Object.entries(SESSIONS)) {
    if (utcDecimal >= session.start && utcDecimal < session.end) {
      console.log(`✅ Sessão ativa: ${session.name} em ${utcHour}:${utcMinutes.toString().padStart(2, '0')} UTC`);
      return session.name;
    }
  }
  
  // Fallback para OCEANIA (00:00-02:30)
  console.log(`✅ Sessão ativa: OCEANIA em ${utcHour}:${utcMinutes.toString().padStart(2, '0')} UTC (fallback)`);
  return 'OCEANIA';
}

// Determine cycle phase based on session
function getCyclePhase(session: string): string {
  if (session === 'TRANSITION') return 'Waiting';
  if (session === 'OCEANIA') return 'Projection_Oceania';
  if (session === 'ASIA') return 'Projection_Asia';
  if (session === 'LONDON') return 'Consolidation';
  if (session === 'NY') return 'Execution';
  return 'Unknown';
}

// Main cycle analysis function
async function analyzeCyclePhase(params: any) {
  const { candles, asset, session, phase, sessionState, supabase, userId } = params;

  // ✅ AGORA PERMITE TRADING EM TRANSITION (Buffer desabilitado)
  if (session === 'TRANSITION') {
    console.log(`⚠️ TRANSITION MODE - Usando análise STANDALONE (buffer desabilitado)`);
    // Não retornar null - continuar com análise standalone
  }

  const candles5m = candles['5m'];
  const candles15m = candles['15m'];
  const candles1h = candles['1h'];
  const candles1m = candles['1m'];

  if (!candles5m || !candles15m || !candles1h || !candles1m) {
    return null;
  }

  const currentPrice = parseFloat(candles5m[candles5m.length - 1].close);
  const indicators = calculateIndicators(candles5m, candles15m, candles1h);

  // ✅ MODO FIMATHE (quando session_state existe com C1)
  if (sessionState?.c1_direction) {
    
    if (phase === 'Projection_Oceania') {
      return await analyzeOceaniaPhase(candles1m, candles15m, candles1h, indicators, currentPrice, asset, sessionState, supabase, userId);
    }
    
    if (phase === 'Projection_Asia') {
      return await analyzeAsiaPhase(candles1m, candles5m, candles15m, candles1h, indicators, currentPrice, asset, sessionState, supabase, userId);
    }
    
    if (phase === 'Consolidation') {
      return await analyzeLondonPhase(candles1m, candles15m, candles1h, indicators, currentPrice, asset, sessionState, supabase, userId);
    }
    
    if (phase === 'Execution') {
      return await analyzeNYPhase(candles1m, candles5m, candles15m, candles1h, indicators, currentPrice, asset, sessionState);
    }
  }
  
  // ✅ MODO STANDALONE HÍBRIDO (quando NÃO há session_state OU em Transition)
  else {
    console.log(`🔧 Modo STANDALONE HÍBRIDO ativado - Session: ${session} | Phase: ${phase}`);
    return await analyzeTechnicalStandalone(
      candles1m,
      candles5m,
      candles15m,
      candles1h,
      indicators,
      currentPrice,
      asset,
      session,
      supabase,
      userId
    );
  }

  return null;
}

// ============================================
// FLAG DE CONTROLE - AGENTES IA
// ============================================
const USE_AI_AGENTS = false; // ⬅️ Desabilitado conforme solicitado

// ============================================
// VALIDAÇÃO DE TENDÊNCIA - EVITAR TRADES CONTRA A TENDÊNCIA
// ============================================
function validateTrendDirection(
  candles1h: any[],
  candles15m: any[],
  indicators: any,
  proposedDirection: 'BUY' | 'SELL',
  asset: string,
  sweepData?: any,
  m1Confirmation?: any
): { valid: boolean; reason: string; trendStrength: number; mode: string } {
  
  console.log(`\n🔍 VALIDANDO TENDÊNCIA - ${asset} (Proposto: ${proposedDirection})`);
  
  // 1. TENDÊNCIA H1: Comparar EMA20 vs EMA50
  const ema20_h1 = indicators.ema_5m; // Aproximação
  const ema50_h1 = indicators.ema_15m; // Aproximação
  
  const h1Trend = ema20_h1 > ema50_h1 ? 'BULLISH' : 'BEARISH';
  
  // 2. TENDÊNCIA M15: Últimas 10 velas
  const recent10_m15 = candles15m.slice(-10);
  let bullishCandles = 0;
  let bearishCandles = 0;
  
  for (const candle of recent10_m15) {
    const close = parseFloat(candle.close);
    const open = parseFloat(candle.open);
    
    if (close > open) bullishCandles++;
    else bearishCandles++;
  }
  
  const m15Trend = bullishCandles > bearishCandles ? 'BULLISH' : 'BEARISH';
  const m15TrendStrength = Math.abs(bullishCandles - bearishCandles) / 10;
  
  // 3. INCLINAÇÃO DE PREÇO: Comparar preço atual vs média das últimas 20 velas H1
  const last20_h1 = candles1h.slice(-20);
  const avgPrice_h1 = last20_h1.reduce((sum, c) => sum + parseFloat(c.close), 0) / last20_h1.length;
  const currentPrice = parseFloat(candles1h[candles1h.length - 1].close);
  
  const priceVsAvg = (currentPrice - avgPrice_h1) / avgPrice_h1;
  const priceTrend = priceVsAvg > 0.005 ? 'BULLISH' : priceVsAvg < -0.005 ? 'BEARISH' : 'NEUTRAL';
  
  console.log(`
📊 ANÁLISE DE TENDÊNCIA - ${asset}:
├─ H1 Trend (EMA20 vs EMA50): ${h1Trend}
├─ M15 Trend (10 velas): ${m15Trend} | Força: ${(m15TrendStrength * 100).toFixed(1)}%
│  ├─ Bullish: ${bullishCandles}/10
│  └─ Bearish: ${bearishCandles}/10
├─ Preço vs Média H1(20): ${priceTrend} | ${(priceVsAvg * 100).toFixed(2)}%
│  ├─ Preço atual: $${currentPrice.toFixed(4)}
│  └─ Média H1(20): $${avgPrice_h1.toFixed(4)}
└─ Proposta: ${proposedDirection}
  `);
  
  // ============================================
  // 🚀 VIA EXPRESSA: FLIP PERFEITO COM FORÇA 95%+
  // ============================================
  if (m1Confirmation && m1Confirmation.confirmationStrength === 'STRONG' && m1Confirmation.m1Strength >= 0.95) {
    console.log(`
🚀 VIA EXPRESSA ATIVADA - ${asset}:
├─ M1 Confirmation: ${m1Confirmation.confirmationStrength}
├─ M1 Strength: ${(m1Confirmation.m1Strength * 100).toFixed(1)}% (mín: 95%)
├─ Sweep: ${sweepData?.sweepType || 'N/A'}
├─ Justificativa: FLIP PERFEITO com momentum extremo
└─ ✅ APROVADO SEM VALIDAÇÕES ADICIONAIS

⚡ IGNORANDO:
├─ ❌ Tipo de sweep (aceita TOTAL, PARTIAL, NEAR)
├─ ❌ Força da vela M15
├─ ❌ Reversão M15
└─ ❌ Alinhamento de tendência
    `);
    
    return {
      valid: true,
      reason: `🚀 Via Expressa: FLIP PERFEITO com ${(m1Confirmation.m1Strength * 100).toFixed(1)}% de força M1`,
      trendStrength: 1.0, // Confiança máxima
      mode: 'EXPRESS_ENTRY'
    };
  }

  // ============================================
  // 🔄 VALIDAÇÃO ESPECIAL: COUNTER-TREND EM SWEEPS DE ALTA QUALIDADE
  // ============================================
  if (sweepData && m1Confirmation) {
    const isSweepTotalOrPartial = sweepData.sweepType === 'TOTAL' || sweepData.sweepType === 'PARTIAL';
    const isSweepNear = sweepData.sweepType === 'NEAR';
    const isStrongConfirmation = m1Confirmation.confirmationStrength === 'STRONG';
    
    // Calcular força da vela M15 (wickLength / (high - low))
    const m15CandleStrength = sweepData.candleStrength || 0; // Já calculado no sweep
    
    // Validar sweep quality com 2 níveis:
    // NÍVEL 1: TOTAL/PARTIAL - sempre qualifica
    // NÍVEL 2: NEAR - qualifica SE força M15 >= 70%
    const isSweepQuality = 
      isSweepTotalOrPartial || 
      (isSweepNear && m15CandleStrength >= 0.70);
    
    if (isSweepQuality && isStrongConfirmation) {
      // Validar MOMENTUM DE REVERSÃO (últimas 5 velas M15)
      const recent5_m15 = candles15m.slice(-5);
      const reversalMomentum = checkReversalMomentum(recent5_m15, proposedDirection);
      
      if (reversalMomentum.detected) {
        console.log(`
🔄 COUNTER-TREND APROVADO - ${asset}:
├─ Sweep: ${sweepData.sweepType}
├─ M1: ${m1Confirmation.confirmationStrength}
├─ Força M15: ${(m15CandleStrength * 100).toFixed(1)}% ${isSweepNear ? '(req: 70%)' : '(sem requisito)'}
├─ Reversão M15: ${reversalMomentum.strength.toFixed(0)}% das últimas 5 velas
├─ H1 Trend: ${h1Trend} (contra)
├─ M15 Trend: ${m15Trend} (contra)
└─ Justificativa: ${isSweepTotalOrPartial ? 'Sweep TOTAL/PARTIAL' : 'Sweep NEAR + Força M15 alta'} + M1 STRONG + Reversão
        `);
        
        return {
          valid: true,
          reason: `✅ Counter-trend aprovado: Sweep ${sweepData.sweepType} + M1 STRONG + Reversão ${reversalMomentum.strength.toFixed(0)}%`,
          trendStrength: 0.8, // 80% de confiança em counter-trend
          mode: 'COUNTER_TREND'
        };
      }
    }
  }
  
  // ============================================
  // 📊 VALIDAÇÃO FLEXIBILIZADA: 66% ALIGNMENT (2 de 3 indicadores)
  // ============================================
  const h1Align = h1Trend === (proposedDirection === 'BUY' ? 'BULLISH' : 'BEARISH');
  const m15Align = m15Trend === (proposedDirection === 'BUY' ? 'BULLISH' : 'BEARISH');
  const priceAlign = priceTrend === (proposedDirection === 'BUY' ? 'BULLISH' : 'BEARISH');
  
  const alignmentScore = (h1Align ? 1 : 0) + (m15Align ? 1 : 0) + (priceAlign ? 1 : 0);
  const trendStrength = alignmentScore / 3;
  
  // REGRA FLEXIBILIZADA: Aceitar 66% (2 de 3 indicadores)
  const valid = trendStrength >= 0.66;
  
  let reason = '';
  if (!valid) {
    reason = `❌ Alinhamento insuficiente: ${(trendStrength * 100).toFixed(0)}% (mínimo: 66%)`;
    
    console.log(`
❌ TRADE REJEITADO - ALINHAMENTO < 66% - ${asset}
├─ Ativo: ${asset}
├─ Direção proposta: ${proposedDirection}
├─ H1 Trend: ${h1Trend} (${h1Align ? '✅' : '❌'})
├─ M15 Trend: ${m15Trend} (${m15Align ? '✅' : '❌'})
├─ Price Trend: ${priceTrend} (${priceAlign ? '✅' : '❌'})
├─ Score: ${(trendStrength * 100).toFixed(0)}% (min: 66%)
└─ Motivo: Pelo menos 2 de 3 indicadores devem estar alinhados
    `);
  } else if (trendStrength === 1.0) {
    reason = `✅ Tendência 100% alinhada: H1=${h1Trend}, M15=${m15Trend}, Price=${priceTrend}`;
  } else {
    reason = `✅ Tendência ${(trendStrength * 100).toFixed(0)}% alinhada (${alignmentScore}/3)`;
  }
  
  console.log(`
${valid ? '✅' : '❌'} RESULTADO: ${reason}
  `);
  
  return {
    valid,
    reason,
    trendStrength,
    mode: 'WITH_TREND'
  };
}

// ============================================
// FUNÇÃO AUXILIAR: DETECTAR MOMENTUM DE REVERSÃO
// ============================================
function checkReversalMomentum(
  recentCandles: any[],
  proposedDirection: 'BUY' | 'SELL'
): { detected: boolean; strength: number } {
  let alignedCandles = 0;
  
  for (const candle of recentCandles) {
    const close = parseFloat(candle.close);
    const open = parseFloat(candle.open);
    const isBullish = close > open;
    
    if (proposedDirection === 'BUY' && isBullish) alignedCandles++;
    if (proposedDirection === 'SELL' && !isBullish) alignedCandles++;
  }
  
  const strength = (alignedCandles / recentCandles.length) * 100;
  
  return {
    detected: strength >= 60, // 60% das últimas 5 velas alinhadas com a direção proposta
    strength
  };
}

// ============================================================================
// MID-RANGE CHECK: Evitar Zona Proibida
// ============================================================================

function checkMidRangeProhibited(
  currentPrice: number,
  h1Structure: any
): { allowed: boolean; reason: string } {
  const midRange = h1Structure.midRange;
  const tolerance = 0.015; // 1.5% de cada lado do mid-range
  
  const distanceToMid = Math.abs(currentPrice - midRange) / midRange;
  
  if (distanceToMid < tolerance) {
    return {
      allowed: false,
      reason: `❌ Preço em ZONA PROIBIDA (mid-range ±1.5%): $${midRange.toFixed(6)}`
    };
  }
  
  return {
    allowed: true,
    reason: `✅ Preço fora da zona proibida (distância: ${(distanceToMid * 100).toFixed(2)}%)`
  };
}

// ============================================================================
// TRADE SETUP VALIDATION: Validação Centralizada Completa
// ============================================================================

async function validateTradeSetup(
  direction: 'BUY' | 'SELL',
  currentPrice: number,
  candles1h: any[],
  candles15m: any[],
  indicators: any,
  h1Structure: any,
  asset: string
): Promise<{ valid: boolean; reason: string; details: any }> {
  
  // 1. Validar tendência (score DEVE ser 100%)
  const trendValidation = validateTrendDirection(
    candles1h, 
    candles15m, 
    indicators, 
    direction, 
    asset
  );
  
  if (!trendValidation.valid || trendValidation.trendStrength < 1.0) {
    return {
      valid: false,
      reason: `Tendência não alinhada 100%: ${trendValidation.reason}`,
      details: { trendValidation }
    };
  }
  
  // 2. Validar mid-range (zona proibida)
  const midRangeCheck = checkMidRangeProhibited(currentPrice, h1Structure);
  
  if (!midRangeCheck.allowed) {
    console.log(`
❌❌❌ TRADE REJEITADO - ZONA PROIBIDA ❌❌❌
├─ Ativo: ${asset}
├─ Preço atual: $${currentPrice.toFixed(6)}
├─ Mid-Range: $${h1Structure.midRange.toFixed(6)}
├─ Distância: ${(Math.abs(currentPrice - h1Structure.midRange) / h1Structure.midRange * 100).toFixed(2)}%
└─ MOTIVO: Preço muito próximo do mid-range (zona neutra)
    `);
    return {
      valid: false,
      reason: midRangeCheck.reason,
      details: { midRange: h1Structure.midRange, currentPrice }
    };
  }
  
  // 3. Validar momentum H1 (força mínima 60%)
  const last5_h1 = candles1h.slice(-5);
  const h1Momentum = detectTrend(last5_h1);
  
  if (h1Momentum.strength < 0.6) {
    console.log(`
❌❌❌ TRADE REJEITADO - MOMENTUM H1 FRACO ❌❌❌
├─ Ativo: ${asset}
├─ Momentum H1: ${(h1Momentum.strength * 100).toFixed(1)}%
├─ Mínimo exigido: 60%
├─ Direção H1: ${h1Momentum.direction}
└─ MOTIVO: Momentum insuficiente no H1
    `);
    return {
      valid: false,
      reason: `❌ Momentum H1 fraco: ${(h1Momentum.strength * 100).toFixed(1)}% (min: 60%)`,
      details: { h1Momentum }
    };
  }
  
  console.log(`
✅✅✅ SETUP VALIDADO - TODOS OS CRITÉRIOS ATENDIDOS ✅✅✅
├─ Ativo: ${asset}
├─ Direção: ${direction}
├─ Tendência: 100% alinhada
├─ Mid-Range: OK (distância segura)
├─ Momentum H1: ${(h1Momentum.strength * 100).toFixed(1)}%
└─ STATUS: APROVADO PARA EXECUÇÃO
  `);
  
  return {
    valid: true,
    reason: '✅ Setup validado: Tendência 100% alinhada + Zona segura + Momentum forte',
    details: {
      trendValidation,
      midRangeCheck,
      h1Momentum
    }
  };
}

// ============================================
// FASE 1: DETECTAR LINHAS MÁGICAS H1
// ============================================
function detectH1MagicLines(candles1h: any[]): {
  resistance: number;
  support: number;
  breakoutAreas: number[];
  midRange: number;
  validZones: boolean;
} {
  if (candles1h.length < 20) {
    return {
      resistance: 0,
      support: 0,
      breakoutAreas: [],
      midRange: 0,
      validZones: false,
    };
  }

  const recent = candles1h.slice(-15); // Últimos 15 períodos H1 (excluindo vela atual)
  
  // Previous High: Maior máxima dos últimos 10-15 períodos
  const resistance = Math.max(...recent.map((c: any) => parseFloat(c.high)));
  
  // Previous Low: Menor mínima dos últimos 10-15 períodos
  const support = Math.min(...recent.map((c: any) => parseFloat(c.low)));
  
  // Mid-Range: Zona proibida (meio do caminho)
  const midRange = (resistance + support) / 2;
  
  // Detectar áreas de breakout (volume alto + movimento > 2%)
  const breakoutAreas: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    const candle = recent[i];
    const open = parseFloat(candle.open);
    const close = parseFloat(candle.close);
    const volume = parseFloat(candle.volume);
    const avgVolume = recent.slice(0, i).reduce((sum: number, c: any) => sum + parseFloat(c.volume), 0) / i;
    
    const priceMove = Math.abs(close - open) / open;
    
    if (volume > avgVolume * 1.5 && priceMove > 0.02) {
      breakoutAreas.push(parseFloat(candle.high));
    }
  }
  
  // Validação: Range deve ser > 1.5% do preço médio
  const avgPrice = (resistance + support) / 2;
  const range = (resistance - support) / avgPrice;
  const validZones = range > 0.015; // Mínimo 1.5% de range
  
  return {
    resistance,
    support,
    breakoutAreas,
    midRange,
    validZones,
  };
}

// ============================================
// 🎯 ESTRATÉGIA "ONE CANDLESTICK" (PRIORIDADE MÁXIMA)
// ============================================

interface OneCandlestickSetup {
  valid: boolean;
  direction: 'BUY' | 'SELL' | null;
  zone: { high: number; low: number } | null;
  entry: number | null;
  stop: number | null;
  target: number | null;
  confidence: number;
  reason: string;
}

/**
 * DETECTA ZONA NEGOCIÁVEL NO M15
 * - SELL: Tendência de baixa (preço < MA20), último candle vermelho
 * - BUY: Tendência de alta (preço > MA20), último candle verde
 */
function detectOneCandlestickZone(
  candles15m: any[],
  currentPrice: number,
  asset: string
): OneCandlestickSetup {
  
  if (!candles15m || candles15m.length < 20) {
    return {
      valid: false,
      direction: null,
      zone: null,
      entry: null,
      stop: null,
      target: null,
      confidence: 0,
      reason: 'Dados M15 insuficientes'
    };
  }

  // ✅ Calcular MA20 no M15
  const last20Candles = candles15m.slice(-20);
  const ma20 = last20Candles.reduce((sum, c) => sum + parseFloat(c.close), 0) / 20;

  // ✅ Último candle M15 fechado
  const lastCandle = candles15m[candles15m.length - 1];
  const open = parseFloat(lastCandle.open);
  const close = parseFloat(lastCandle.close);
  const high = parseFloat(lastCandle.high);
  const low = parseFloat(lastCandle.low);

  const isBullish = close > open;
  const isBearish = close < open;

  // ============================================
  // 🟡 FASE 2: SETUP DE VENDA SIMPLIFICADO (BEARISH)
  // ============================================
  const bodySize = Math.abs(close - open);
  const totalSize = high - low;
  const bodyPercent = totalSize > 0 ? bodySize / totalSize : 0;
  
  // ✅ ACEITAR QUALQUER CANDLE VERMELHO COM CORPO > 40%
  if (isBearish && bodyPercent >= 0.4) {
    // Zona Negociável: Entre HIGH e CLOSE do candle vermelho
    const zoneHigh = high;
    const zoneLow = close;

    console.log(`
🔴 ONE CANDLESTICK ZONE DETECTADA (SELL) - ${asset}:
├─ Candle M15: Vermelho com ${(bodyPercent * 100).toFixed(0)}% de corpo
├─ MA20: $${ma20.toFixed(4)} (referência)
├─ Close vs MA20: ${close < ma20 ? '✅ Abaixo (bônus)' : '⚠️ Acima'}
├─ ZONA NEGOCIÁVEL:
│  ├─ HIGH: $${zoneHigh.toFixed(4)}
│  └─ CLOSE: $${zoneLow.toFixed(4)}
└─ Preço Atual: $${currentPrice.toFixed(4)}
    `);

    // Confiança: 70% base + 20% bônus se close < MA20
    const confidence = close < ma20 ? 0.9 : 0.7;
    
    return {
      valid: true,
      direction: 'SELL',
      zone: { high: zoneHigh, low: zoneLow },
      entry: null,
      stop: null,
      target: null,
      confidence,
      reason: `Zona SELL: Corpo ${(bodyPercent * 100).toFixed(0)}% + ${close < ma20 ? 'MA20 confirmada' : 'sem MA20'}`
    };
  }

  // ============================================
  // 🟡 FASE 2: SETUP DE COMPRA SIMPLIFICADO (BULLISH)
  // ============================================
  // ✅ ACEITAR QUALQUER CANDLE VERDE COM CORPO > 40%
  if (isBullish && bodyPercent >= 0.4) {
    // Zona Negociável: Entre LOW e CLOSE do candle verde
    const zoneHigh = close;
    const zoneLow = low;

    console.log(`
🟢 ONE CANDLESTICK ZONE DETECTADA (BUY) - ${asset}:
├─ Candle M15: Verde com ${(bodyPercent * 100).toFixed(0)}% de corpo
├─ MA20: $${ma20.toFixed(4)} (referência)
├─ Close vs MA20: ${close > ma20 ? '✅ Acima (bônus)' : '⚠️ Abaixo'}
├─ ZONA NEGOCIÁVEL:
│  ├─ CLOSE: $${zoneHigh.toFixed(4)}
│  └─ LOW: $${zoneLow.toFixed(4)}
└─ Preço Atual: $${currentPrice.toFixed(4)}
    `);

    // Confiança: 70% base + 20% bônus se close > MA20
    const confidence = close > ma20 ? 0.9 : 0.7;
    
    return {
      valid: true,
      direction: 'BUY',
      zone: { high: zoneHigh, low: zoneLow },
      entry: null,
      stop: null,
      target: null,
      confidence,
      reason: `Zona BUY: Corpo ${(bodyPercent * 100).toFixed(0)}% + ${close > ma20 ? 'MA20 confirmada' : 'sem MA20'}`
    };
  }

  return {
    valid: false,
    direction: null,
    zone: null,
    entry: null,
    stop: null,
    target: null,
    confidence: 0,
    reason: `Nenhuma zona qualificada (corpo: ${(bodyPercent * 100).toFixed(0)}% - mínimo: 40%)`
  };
}

/**
 * VALIDA PULLBACK + FIBONACCI + MA20 NO M1
 */
function validateOneCandlestickEntry(
  candles1m: any[],
  zone: { high: number; low: number },
  direction: 'BUY' | 'SELL',
  currentPrice: number,
  asset: string
): {
  valid: boolean;
  entry: number | null;
  stop: number | null;
  target: number | null;
  confidence: number;
  reason: string;
} {
  
  if (!candles1m || candles1m.length < 20) {
    return {
      valid: false,
      entry: null,
      stop: null,
      target: null,
      confidence: 0,
      reason: 'Dados M1 insuficientes'
    };
  }

  // ✅ Calcular MA20 no M1
  const last20Candles = candles1m.slice(-20);
  const ma20M1 = last20Candles.reduce((sum, c) => sum + parseFloat(c.close), 0) / 20;

  // ✅ Verificar se preço está dentro da Zona Negociável
  const inZone = currentPrice >= zone.low && currentPrice <= zone.high;

  if (!inZone) {
    return {
      valid: false,
      entry: null,
      stop: null,
      target: null,
      confidence: 0,
      reason: `Preço fora da zona (${currentPrice.toFixed(4)} não está entre ${zone.low.toFixed(4)} - ${zone.high.toFixed(4)})`
    };
  }

  // ✅ Calcular Fibonacci do pullback (últimas 10 velas M1)
  const recentCandles = candles1m.slice(-10);
  const pullbackHigh = Math.max(...recentCandles.map(c => parseFloat(c.high)));
  const pullbackLow = Math.min(...recentCandles.map(c => parseFloat(c.low)));
  const fibRange = pullbackHigh - pullbackLow;

  // 🟡 FASE 2: ACEITAR QUALQUER ZONA FIBONACCI (38.2% - 78.6%)
  const fib382 = pullbackLow + (fibRange * 0.382);
  const fib50 = pullbackLow + (fibRange * 0.5);
  const fib618 = pullbackLow + (fibRange * 0.618);
  const fib786 = pullbackLow + (fibRange * 0.786);

  // ✅ Verificar se preço está em QUALQUER zona Fib (38.2%-78.6%)
  const inAnyFibZone = currentPrice >= fib382 && currentPrice <= fib786;

  // ✅ Último candle M1
  const lastM1 = candles1m[candles1m.length - 1];
  const closeM1 = parseFloat(lastM1.close);
  const openM1 = parseFloat(lastM1.open);

  // ============================================
  // 🟡 FASE 2: GATILHO DE ENTRADA SIMPLIFICADO
  // ============================================
  let entryTriggered = false;
  let entryReason = '';
  let confidence = 0.75;

  if (direction === 'SELL') {
    // SELL: Preço em zona Fib E (close < MA20 OU vela vermelha)
    if (inAnyFibZone && (closeM1 < ma20M1 || closeM1 < openM1)) {
      entryTriggered = true;
      if (closeM1 < ma20M1) {
        entryReason = `Fib Zone (${fib382.toFixed(4)}-${fib786.toFixed(4)}) + MA20 confirmada (${ma20M1.toFixed(4)})`;
        confidence = 0.85; // Bônus MA20
      } else {
        entryReason = `Fib Zone (${fib382.toFixed(4)}-${fib786.toFixed(4)}) + Vela vermelha confirmada`;
        confidence = 0.75;
      }
    }
  } else if (direction === 'BUY') {
    // BUY: Preço em zona Fib E (close > MA20 OU vela verde)
    if (inAnyFibZone && (closeM1 > ma20M1 || closeM1 > openM1)) {
      entryTriggered = true;
      if (closeM1 > ma20M1) {
        entryReason = `Fib Zone (${fib382.toFixed(4)}-${fib786.toFixed(4)}) + MA20 confirmada (${ma20M1.toFixed(4)})`;
        confidence = 0.85; // Bônus MA20
      } else {
        entryReason = `Fib Zone (${fib382.toFixed(4)}-${fib786.toFixed(4)}) + Vela verde confirmada`;
        confidence = 0.75;
      }
    }
  }

  if (!entryTriggered) {
    return {
      valid: false,
      entry: null,
      stop: null,
      target: null,
      confidence: 0,
      reason: `Aguardando: ${inAnyFibZone ? 'Confirmação M1 (vela ou MA20)' : 'Preço entrar em zona Fib'}`
    };
  }

  // ✅ CALCULAR NÍVEIS DE EXECUÇÃO
  const entry = closeM1;
  
  const stop = direction === 'SELL' 
    ? zone.high * 1.002
    : zone.low * 0.998;

  const riskDistance = Math.abs(entry - stop);
  const target = direction === 'SELL'
    ? entry - (riskDistance * 1.8) // R:R de 1.8:1
    : entry + (riskDistance * 1.8);

  const rrRatio = Math.abs(target - entry) / Math.abs(entry - stop);

  console.log(`
✅ ONE CANDLESTICK - ENTRADA CONFIRMADA (${direction}) - ${asset}:
├─ Preço na Zona: $${currentPrice.toFixed(4)} (${zone.low.toFixed(4)} - ${zone.high.toFixed(4)})
├─ Fibonacci Zone: $${fib382.toFixed(4)} - $${fib786.toFixed(4)} (38.2%-78.6%)
├─ MA20 M1: $${ma20M1.toFixed(4)} ${closeM1 < ma20M1 && direction === 'SELL' ? '✅' : closeM1 > ma20M1 && direction === 'BUY' ? '✅' : '(ref)'}
├─ Close M1: $${closeM1.toFixed(4)}
├─ ✅ GATILHO: ${entryReason}
├─ Entry: $${entry.toFixed(4)}
├─ Stop Loss: $${stop.toFixed(4)} (${(Math.abs(entry - stop) / entry * 100).toFixed(2)}%)
├─ Take Profit: $${target.toFixed(4)}
├─ R:R: 1:${rrRatio.toFixed(2)}
└─ Confiança: ${(confidence * 100).toFixed(0)}%
  `);

  return {
    valid: true,
    entry,
    stop,
    target,
    confidence,
    reason: `One Candlestick: ${entryReason}`
  };
}

// ============================================
// FASE 2: VERIFICAR ZONA DE OPERAÇÃO
// ============================================
function checkTradingZone(
  currentPrice: number,
  h1Lines: any
): {
  zone: 'BUY_ZONE' | 'SELL_ZONE' | 'NO_TRADE_ZONE';
  distance: number;
  status: string;
} {
  const { support, resistance, midRange } = h1Lines;
  
  // Tolerância de ±0.8% para considerar "na zona"
  const tolerance = 0.008;
  
  const distanceToSupport = Math.abs(currentPrice - support) / support;
  const distanceToResistance = Math.abs(currentPrice - resistance) / resistance;
  
  // BUY_ZONE: Dentro de ±0.8% do support
  if (distanceToSupport <= tolerance) {
    return {
      zone: 'BUY_ZONE',
      distance: distanceToSupport * 100,
      status: `Preço em zona de suporte (${distanceToSupport * 100}% da linha)`,
    };
  }
  
  // SELL_ZONE: Dentro de ±0.8% da resistance
  if (distanceToResistance <= tolerance) {
    return {
      zone: 'SELL_ZONE',
      distance: distanceToResistance * 100,
      status: `Preço em zona de resistência (${distanceToResistance * 100}% da linha)`,
    };
  }
  
  // NO_TRADE_ZONE: No meio do range
  return {
    zone: 'NO_TRADE_ZONE',
    distance: Math.min(distanceToSupport, distanceToResistance) * 100,
    status: 'Preço no meio do range (zona de ruído)',
  };
}

// ============================================
// FASE 3: DETECTAR PADRÃO PITCHFORK (5M)
// ============================================
function detectPitchforkPattern(
  candles5m: any[],
  signal: 'LONG' | 'SHORT',
  h1Lines: any,
  asset: string = 'UNKNOWN'
): {
  confirmed: boolean;
  status: string;
  sequenceLength: number;
  firstReversalHigh?: number;
  firstReversalLow?: number;
  entryPrice?: number;
  stopLoss?: number;
} {
  console.log(`\n🔍 ANALISANDO PITCHFORK M5 - ${asset} (${signal})`);
  
  if (!candles5m || candles5m.length < 10) {
    console.log(`❌ Dados insuficientes: ${candles5m?.length || 0} velas M5`);
    return { confirmed: false, status: 'Dados insuficientes', sequenceLength: 0 };
  }

  const last10 = candles5m.slice(-10);
  const lastCandle = last10[last10.length - 1];
  const penultimateCandle = last10[last10.length - 2];
  const candleSequence = last10.map(c => parseFloat(c.close) > parseFloat(c.open) ? '🟢' : '🔴').join(' ');

  // ============================================
  // PADRÃO LONG: 🔴🔴...🔴 🟢 🟢
  // ============================================
  if (signal === 'LONG') {
    const currentIsGreen = parseFloat(lastCandle.close) > parseFloat(lastCandle.open);
    const penultimateIsGreen = parseFloat(penultimateCandle.close) > parseFloat(penultimateCandle.open);
    
    // 1. Verificar se as DUAS últimas velas são VERDES
    if (!currentIsGreen) {
      console.log(`
🕯️ PITCHFORK M5 - ${asset} (LONG):
├─ Últimas 10 velas: ${candleSequence}
├─ Vela atual: 🔴
└─ Status: Aguardando primeira vela VERDE ❌
      `);
      return { confirmed: false, status: 'Aguardando primeira vela verde', sequenceLength: 0 };
    }
    
    if (!penultimateIsGreen) {
      console.log(`
🕯️ PITCHFORK M5 - ${asset} (LONG):
├─ Últimas 10 velas: ${candleSequence}
├─ Última vela: 🟢 ✅
├─ Penúltima vela: 🔴
└─ Status: Aguardando segunda vela VERDE ❌
      `);
      return { confirmed: false, status: 'Aguardando segunda vela verde', sequenceLength: 0 };
    }
    
    // 2. Contar velas VERMELHAS antes das duas verdes
    let redCandlesCount = 0;
    for (let i = last10.length - 3; i >= 0; i--) {
      const isRed = parseFloat(last10[i].close) < parseFloat(last10[i].open);
      if (isRed) {
        redCandlesCount++;
      } else {
        break;
      }
    }
    
    if (redCandlesCount < 2) {
      console.log(`
🕯️ PITCHFORK M5 - ${asset} (LONG):
├─ Últimas 10 velas: ${candleSequence}
├─ Velas vermelhas ANTES das verdes: ${redCandlesCount}
└─ Status: Aguardando sequência de queda (mínimo 2) ❌
      `);
      return { confirmed: false, status: 'Aguardando sequência de queda', sequenceLength: redCandlesCount };
    }
    
    // 3. Verificar se N rompeu a máxima de N-1
    const penultimateHigh = parseFloat(penultimateCandle.high);
    const currentClose = parseFloat(lastCandle.close);
    
    if (currentClose >= penultimateHigh) {
      const penultimateLow = parseFloat(penultimateCandle.low);
      
      console.log(`
🎯 GATILHO LONG CONFIRMADO - ${asset}:
├─ Sequência: ${redCandlesCount} velas vermelhas 🔴 + 2 verdes 🟢
├─ N-1: Máxima $${penultimateHigh.toFixed(6)}
├─ N: Fechamento $${currentClose.toFixed(6)}
├─ ✅ ROMPEU A MÁXIMA!
├─ Entry: $${currentClose.toFixed(6)}
└─ Stop: $${penultimateLow.toFixed(6)}
      `);
      
      return {
        confirmed: true,
        status: 'Rompimento confirmado',
        sequenceLength: redCandlesCount,
        entryPrice: currentClose,
        stopLoss: penultimateLow,
      };
    }
    
    console.log(`
🕯️ PITCHFORK M5 - ${asset} (LONG):
├─ Sequência: ${redCandlesCount} vermelhas ✅ + 2 verdes ✅
├─ N-1: Máxima $${penultimateHigh.toFixed(6)}
├─ N: Fechamento $${currentClose.toFixed(6)}
└─ Status: Aguardando rompimento (precisa > $${penultimateHigh.toFixed(6)}) ⏳
      `);
    
    return {
      confirmed: false,
      status: 'Aguardando rompimento da máxima',
      sequenceLength: redCandlesCount,
    };
  }
  
  // ============================================
  // PADRÃO SHORT: 🟢🟢...🟢 🔴 🔴
  // ============================================
  if (signal === 'SHORT') {
    const currentIsRed = parseFloat(lastCandle.close) < parseFloat(lastCandle.open);
    const penultimateIsRed = parseFloat(penultimateCandle.close) < parseFloat(penultimateCandle.open);
    
    // 1. Verificar se as DUAS últimas velas são VERMELHAS
    if (!currentIsRed) {
      console.log(`
🕯️ PITCHFORK M5 - ${asset} (SHORT):
├─ Últimas 10 velas: ${candleSequence}
├─ Vela atual: 🟢
└─ Status: Aguardando primeira vela VERMELHA ❌
      `);
      return { confirmed: false, status: 'Aguardando primeira vela vermelha', sequenceLength: 0 };
    }
    
    if (!penultimateIsRed) {
      console.log(`
🕯️ PITCHFORK M5 - ${asset} (SHORT):
├─ Últimas 10 velas: ${candleSequence}
├─ Última vela: 🔴 ✅
├─ Penúltima vela: 🟢
└─ Status: Aguardando segunda vela VERMELHA ❌
      `);
      return { confirmed: false, status: 'Aguardando segunda vela vermelha', sequenceLength: 0 };
    }
    
    // 2. Contar velas VERDES antes das duas vermelhas
    let greenCandlesCount = 0;
    for (let i = last10.length - 3; i >= 0; i--) {
      const isGreen = parseFloat(last10[i].close) > parseFloat(last10[i].open);
      if (isGreen) {
        greenCandlesCount++;
      } else {
        break;
      }
    }
    
    if (greenCandlesCount < 2) {
      console.log(`
🕯️ PITCHFORK M5 - ${asset} (SHORT):
├─ Últimas 10 velas: ${candleSequence}
├─ Velas verdes ANTES das vermelhas: ${greenCandlesCount}
└─ Status: Aguardando sequência de subida (mínimo 2) ❌
      `);
      return { confirmed: false, status: 'Aguardando sequência de subida', sequenceLength: greenCandlesCount };
    }
    
    // 3. Verificar se N rompeu a mínima de N-1
    const penultimateLow = parseFloat(penultimateCandle.low);
    const currentClose = parseFloat(lastCandle.close);
    
    if (currentClose <= penultimateLow) {
      const penultimateHigh = parseFloat(penultimateCandle.high);
      
      console.log(`
🎯 GATILHO SHORT CONFIRMADO - ${asset}:
├─ Sequência: ${greenCandlesCount} velas verdes 🟢 + 2 vermelhas 🔴
├─ N-1: Mínima $${penultimateLow.toFixed(6)}
├─ N: Fechamento $${currentClose.toFixed(6)}
├─ ✅ ROMPEU A MÍNIMA!
├─ Entry: $${currentClose.toFixed(6)}
└─ Stop: $${penultimateHigh.toFixed(6)}
      `);
      
      return {
        confirmed: true,
        status: 'Rompimento confirmado',
        sequenceLength: greenCandlesCount,
        entryPrice: currentClose,
        stopLoss: penultimateHigh,
      };
    }
    
    console.log(`
🕯️ PITCHFORK M5 - ${asset} (SHORT):
├─ Sequência: ${greenCandlesCount} verdes ✅ + 2 vermelhas ✅
├─ N-1: Mínima $${penultimateLow.toFixed(6)}
├─ N: Fechamento $${currentClose.toFixed(6)}
└─ Status: Aguardando rompimento (precisa < $${penultimateLow.toFixed(6)}) ⏳
      `);
    
    return {
      confirmed: false,
      status: 'Aguardando rompimento da mínima',
      sequenceLength: greenCandlesCount,
    };
  }
  
  return { confirmed: false, status: 'Sinal inválido', sequenceLength: 0 };
}

// ============================================
// NOVA ESTRATÉGIA: H1 + M15 + M1 COM SWEEP DE LIQUIDEZ
// ============================================

// ============================================
// ETAPA 1: ANALISAR ESTRUTURA H1 (MARCAÇÕES)
// ============================================
function analyzeH1Structure(candles1h: any[]): {
  previousHigh: number;
  previousLow: number;
  sessionHighs: { oceania: number; asia: number; london: number };
  sessionLows: { oceania: number; asia: number; london: number };
  structuralLevels: number[];
  validStructure: boolean;
  midRange: number;
} {
  if (candles1h.length < 24) {
    return {
      previousHigh: 0,
      previousLow: 0,
      sessionHighs: { oceania: 0, asia: 0, london: 0 },
      sessionLows: { oceania: 0, asia: 0, london: 0 },
      structuralLevels: [],
      validStructure: false,
      midRange: 0,
    };
  }

  // Últimas 24 horas H1 (cobrem todas as sessões)
  const last24h = candles1h.slice(-24);
  
  // Máxima e Mínima Anterior (últimas 15 velas)
  const recent15 = last24h.slice(-15);
  const previousHigh = Math.max(...recent15.map((c: any) => parseFloat(c.high)));
  const previousLow = Math.min(...recent15.map((c: any) => parseFloat(c.low)));
  const midRange = (previousHigh + previousLow) / 2;
  
  // Máximas/Mínimas por sessão (aproximação UTC)
  const oceaniaCandles = last24h.slice(0, 3);   // 00:00-03:00 UTC
  const asiaCandles = last24h.slice(3, 8);      // 03:00-08:00 UTC
  const londonCandles = last24h.slice(8, 13);   // 08:00-13:00 UTC
  
  const sessionHighs = {
    oceania: oceaniaCandles.length > 0 ? Math.max(...oceaniaCandles.map((c: any) => parseFloat(c.high))) : 0,
    asia: asiaCandles.length > 0 ? Math.max(...asiaCandles.map((c: any) => parseFloat(c.high))) : 0,
    london: londonCandles.length > 0 ? Math.max(...londonCandles.map((c: any) => parseFloat(c.high))) : 0,
  };
  
  const sessionLows = {
    oceania: oceaniaCandles.length > 0 ? Math.min(...oceaniaCandles.map((c: any) => parseFloat(c.low))) : 0,
    asia: asiaCandles.length > 0 ? Math.min(...asiaCandles.map((c: any) => parseFloat(c.low))) : 0,
    london: londonCandles.length > 0 ? Math.min(...londonCandles.map((c: any) => parseFloat(c.low))) : 0,
  };
  
  // Níveis estruturais (imbalances, breakouts)
  const structuralLevels: number[] = [];
  for (let i = 1; i < recent15.length - 1; i++) {
    const prev = parseFloat(recent15[i - 1].close);
    const curr = parseFloat(recent15[i].close);
    const next = parseFloat(recent15[i + 1].close);
    
    // Detectar swing highs/lows
    if (curr > prev && curr > next) {
      structuralLevels.push(parseFloat(recent15[i].high));
    }
    if (curr < prev && curr < next) {
      structuralLevels.push(parseFloat(recent15[i].low));
    }
  }
  
  // Validação: Range deve ser > 2% do preço médio
  const avgPrice = (previousHigh + previousLow) / 2;
  const range = (previousHigh - previousLow) / avgPrice;
  const validStructure = range > 0.02; // Mínimo 2% de range
  
  return {
    previousHigh,
    previousLow,
    sessionHighs,
    sessionLows,
    structuralLevels,
    validStructure,
    midRange,
  };
}

// ============================================
// ETAPA 2: DETECTAR SWEEP DE LIQUIDEZ NO M15 (FAKE OUT) - FLEXIBILIZADO
// ============================================
function detectM15Sweep(
  candles15m: any[],
  h1Structure: any,
  asset: string,
  sensitivity: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
): {
  sweepDetected: boolean;
  sweepType: 'TOTAL' | 'PARTIAL' | 'NEAR';
  sweptLevel: number;
  levelType: 'previousHigh' | 'previousLow' | 'sessionHigh' | 'sessionLow' | null;
  direction: 'BUY' | 'SELL' | null;
  m15ClosePrice: number;
  m15OpenPrice: number;
  wickLength: number;
  candleStrength: number;
  candleAge: number;
} {
  if (candles15m.length < 5) {
    return {
      sweepDetected: false,
      sweepType: 'TOTAL',
      sweptLevel: 0,
      levelType: null,
      direction: null,
      m15ClosePrice: 0,
      m15OpenPrice: 0,
      wickLength: 0,
      candleStrength: 0,
      candleAge: 0,
    };
  }

  // ✅ Configurações de tolerância baseadas na sensibilidade
  const tolerances = {
    HIGH: { 
      touch: 0.001,      // 0.1% - sweep próximo
      close: 0.0002,     // 0.02% - fechamento mais próximo
    },
    MEDIUM: {
      touch: 0.002,      // 0.2% - sweep parcial
      close: 0.0005,     // 0.05% - atual
    },
    LOW: {
      touch: 0.005,      // 0.5% - sweep total
      close: 0.001,      // 0.1% - mais flexível
    }
  };

  const config = tolerances[sensitivity];

  // ✅ Analisar últimas 3 velas M15 (ao invés de apenas 1)
  const recentCandles = candles15m.slice(-3);
  
  // Verificar todos os níveis importantes
  const levelsToCheck = [
    { value: h1Structure.previousHigh, type: 'previousHigh' as const, direction: 'SELL' as const },
    { value: h1Structure.previousLow, type: 'previousLow' as const, direction: 'BUY' as const },
    { value: h1Structure.sessionHighs.oceania, type: 'sessionHigh' as const, direction: 'SELL' as const },
    { value: h1Structure.sessionHighs.asia, type: 'sessionHigh' as const, direction: 'SELL' as const },
    { value: h1Structure.sessionHighs.london, type: 'sessionHigh' as const, direction: 'SELL' as const },
    { value: h1Structure.sessionLows.oceania, type: 'sessionLow' as const, direction: 'BUY' as const },
    { value: h1Structure.sessionLows.asia, type: 'sessionLow' as const, direction: 'BUY' as const },
    { value: h1Structure.sessionLows.london, type: 'sessionLow' as const, direction: 'BUY' as const },
  ];
  
  // ✅ Iterar sobre as últimas 3 velas M15
  for (let candleIdx = 0; candleIdx < recentCandles.length; candleIdx++) {
    const candle = recentCandles[candleIdx];
    const candleAge = recentCandles.length - candleIdx - 1; // 0 = mais recente, 2 = mais antiga
    
    const candleHigh = parseFloat(candle.high);
    const candleLow = parseFloat(candle.low);
    const candleClose = parseFloat(candle.close);
    const candleOpen = parseFloat(candle.open);
    
    const candleBody = Math.abs(candleClose - candleOpen);
    const candleRange = candleHigh - candleLow;
    const candleStrength = candleRange > 0 ? candleBody / candleRange : 0;
    
    for (const level of levelsToCheck) {
      if (level.value === 0) continue;
      
      // SWEEP PARA SELL (preço vai acima do nível mas fecha abaixo)
      if (level.direction === 'SELL') {
        let sweepType: 'TOTAL' | 'PARTIAL' | 'NEAR' = 'TOTAL';
        let sweepDetected = false;
        
        // SWEEP TOTAL: High ultrapassa + Close abaixo com tolerância LOW
        if (candleHigh > level.value && candleClose < (level.value - level.value * config.close)) {
          sweepType = 'TOTAL';
          sweepDetected = true;
        }
        // SWEEP PARCIAL: High ultrapassa + Close próximo do nível
        else if (candleHigh > level.value && candleClose < level.value) {
          sweepType = 'PARTIAL';
          sweepDetected = true;
        }
        // SWEEP PRÓXIMO: High chega perto do nível (dentro de touch tolerance)
        else if (candleHigh > (level.value - level.value * config.touch) && candleHigh < level.value) {
          sweepType = 'NEAR';
          sweepDetected = true;
        }
        
        if (sweepDetected) {
          const wickLength = candleHigh - Math.max(candleClose, candleOpen);
          
          console.log(`
🎯 SWEEP DETECTADO (SELL) - ${asset}:
├─ Tipo: ${sweepType} (sensibilidade: ${sensitivity})
├─ Nível varrido: ${level.type} = $${level.value.toFixed(4)}
├─ Candle High: $${candleHigh.toFixed(4)}
├─ Candle Close: $${candleClose.toFixed(4)}
├─ Pavio: ${wickLength.toFixed(4)} (${(wickLength / level.value * 100).toFixed(2)}%)
├─ Força da vela: ${(candleStrength * 100).toFixed(1)}% (corpo/range)
└─ Idade: ${candleAge === 0 ? 'Última vela' : `${candleAge} velas atrás`}
          `);
          
          return {
            sweepDetected: true,
            sweepType,
            sweptLevel: level.value,
            levelType: level.type,
            direction: 'SELL',
            m15ClosePrice: candleClose,
            m15OpenPrice: candleClose,
            wickLength,
            candleStrength,
            candleAge,
          };
        }
      }
      
      // SWEEP PARA BUY (preço vai abaixo do nível mas fecha acima)
      if (level.direction === 'BUY') {
        let sweepType: 'TOTAL' | 'PARTIAL' | 'NEAR' = 'TOTAL';
        let sweepDetected = false;
        
        // SWEEP TOTAL: Low ultrapassa + Close acima com tolerância LOW
        if (candleLow < level.value && candleClose > (level.value + level.value * config.close)) {
          sweepType = 'TOTAL';
          sweepDetected = true;
        }
        // SWEEP PARCIAL: Low ultrapassa + Close próximo do nível
        else if (candleLow < level.value && candleClose > level.value) {
          sweepType = 'PARTIAL';
          sweepDetected = true;
        }
        // SWEEP PRÓXIMO: Low chega perto do nível (dentro de touch tolerance)
        else if (candleLow < (level.value + level.value * config.touch) && candleLow > level.value) {
          sweepType = 'NEAR';
          sweepDetected = true;
        }
        
        if (sweepDetected) {
          const wickLength = Math.min(candleClose, candleOpen) - candleLow;
          
          console.log(`
🎯 SWEEP DETECTADO (BUY) - ${asset}:
├─ Tipo: ${sweepType} (sensibilidade: ${sensitivity})
├─ Nível varrido: ${level.type} = $${level.value.toFixed(4)}
├─ Candle Low: $${candleLow.toFixed(4)}
├─ Candle Close: $${candleClose.toFixed(4)}
├─ Pavio: ${wickLength.toFixed(4)} (${(wickLength / level.value * 100).toFixed(2)}%)
├─ Força da vela: ${(candleStrength * 100).toFixed(1)}% (corpo/range)
└─ Idade: ${candleAge === 0 ? 'Última vela' : `${candleAge} velas atrás`}
          `);
          
          return {
            sweepDetected: true,
            sweepType,
            sweptLevel: level.value,
            levelType: level.type,
            direction: 'BUY',
            m15ClosePrice: candleClose,
            m15OpenPrice: candleClose,
            wickLength,
            candleStrength,
            candleAge,
          };
        }
      }
    }
  }
  
  // Nenhum sweep encontrado
  const lastCandle = recentCandles[recentCandles.length - 1];
  const candleClose = parseFloat(lastCandle.close);
  const candleBody = Math.abs(parseFloat(lastCandle.close) - parseFloat(lastCandle.open));
  const candleRange = parseFloat(lastCandle.high) - parseFloat(lastCandle.low);
  const candleStrength = candleRange > 0 ? candleBody / candleRange : 0;
  
  return {
    sweepDetected: false,
    sweepType: 'TOTAL',
    sweptLevel: 0,
    levelType: null,
    direction: null,
    m15ClosePrice: candleClose,
    m15OpenPrice: 0,
    wickLength: 0,
    candleStrength,
    candleAge: 0,
  };
}

// ============================================
// ETAPA 3: CONFIRMAR ENTRADA NO M1 (FLIP) - COM GRADUAÇÃO
// ============================================
function confirmM1Entry(
  candles1m: any[],
  sweepData: any,
  asset: string,
  confirmationMode: 'STRONG' | 'MODERATE' | 'WEAK' = 'MODERATE'
): {
  entryConfirmed: boolean;
  confirmationStrength: 'STRONG' | 'MODERATE' | 'WEAK';
  confidenceAdjustment: number;
  entryPrice: number;
  confirmationTime: string;
  m1Strength: number;
  flipCandle: any;
} {
  if (!candles1m || candles1m.length < 3) {
    return {
      entryConfirmed: false,
      confirmationStrength: 'WEAK',
      confidenceAdjustment: -0.2,
      entryPrice: 0,
      confirmationTime: '',
      m1Strength: 0,
      flipCandle: null,
    };
  }

  const triggerLine = sweepData.m15ClosePrice;
  const direction = sweepData.direction;
  
  // Últimas 15 velas M1 (15 minutos)
  const recent15m1 = candles1m.slice(-15);
  
  // ============================================
  // NÍVEL 1: CONFIRMAÇÃO FORTE (FLIP PERFEITO)
  // ============================================
  for (let i = recent15m1.length - 1; i >= 0; i--) {
    const candle = recent15m1[i];
    const candleClose = parseFloat(candle.close);
    const candleOpen = parseFloat(candle.open);
    const candleBody = Math.abs(candleClose - candleOpen);
    const candleRange = parseFloat(candle.high) - parseFloat(candle.low);
    const m1Strength = candleRange > 0 ? candleBody / candleRange : 0;
    
    // CONFIRMAR BUY: vela M1 fecha ACIMA da linha de gatilho
    if (direction === 'BUY' && candleClose > triggerLine && candleOpen <= triggerLine) {
      console.log(`
✅ ENTRADA CONFIRMADA FORTE (BUY) - ${asset}:
├─ Tipo: FLIP PERFEITO 🎯
├─ Linha de gatilho: $${triggerLine.toFixed(4)}
├─ M1 Open: $${candleOpen.toFixed(4)} (abaixo ✅)
├─ M1 Close: $${candleClose.toFixed(4)} (acima ✅)
├─ Força M1: ${(m1Strength * 100).toFixed(1)}%
├─ Ajuste de confiança: +0 (sem penalidade)
└─ Timestamp: ${candle.timestamp || 'N/A'}
      `);
      
      return {
        entryConfirmed: true,
        confirmationStrength: 'STRONG',
        confidenceAdjustment: 0,
        entryPrice: candleClose,
        confirmationTime: candle.timestamp || new Date().toISOString(),
        m1Strength,
        flipCandle: candle,
      };
    }
    
    // CONFIRMAR SELL: vela M1 fecha ABAIXO da linha de gatilho
    if (direction === 'SELL' && candleClose < triggerLine && candleOpen >= triggerLine) {
      console.log(`
✅ ENTRADA CONFIRMADA FORTE (SELL) - ${asset}:
├─ Tipo: FLIP PERFEITO 🎯
├─ Linha de gatilho: $${triggerLine.toFixed(4)}
├─ M1 Open: $${candleOpen.toFixed(4)} (acima ✅)
├─ M1 Close: $${candleClose.toFixed(4)} (abaixo ✅)
├─ Força M1: ${(m1Strength * 100).toFixed(1)}%
├─ Ajuste de confiança: +0 (sem penalidade)
└─ Timestamp: ${candle.timestamp || 'N/A'}
      `);
      
      return {
        entryConfirmed: true,
        confirmationStrength: 'STRONG',
        confidenceAdjustment: 0,
        entryPrice: candleClose,
        confirmationTime: candle.timestamp || new Date().toISOString(),
        m1Strength,
        flipCandle: candle,
      };
    }
  }
  
  // ============================================
  // NÍVEL 2: CONFIRMAÇÃO MODERADA (2 velas consecutivas)
  // ============================================
  if (confirmationMode === 'MODERATE' || confirmationMode === 'WEAK') {
    for (let i = recent15m1.length - 1; i >= 1; i--) {
      const candle1 = recent15m1[i];
      const candle2 = recent15m1[i - 1];
      
      const close1 = parseFloat(candle1.close);
      const close2 = parseFloat(candle2.close);
      const open1 = parseFloat(candle1.open);
      
      const avgStrength = (
        Math.abs(close1 - open1) / (parseFloat(candle1.high) - parseFloat(candle1.low))
      );
      
      // BUY: 2 velas consecutivas fecham acima da linha
      if (direction === 'BUY' && close1 > triggerLine && close2 > triggerLine) {
        console.log(`
✅ ENTRADA CONFIRMADA MODERADA (BUY) - ${asset}:
├─ Tipo: 2 VELAS CONSECUTIVAS ACIMA 📊
├─ Linha de gatilho: $${triggerLine.toFixed(4)}
├─ M1[1] Close: $${close1.toFixed(4)} (acima ✅)
├─ M1[2] Close: $${close2.toFixed(4)} (acima ✅)
├─ Força média: ${(avgStrength * 100).toFixed(1)}%
├─ Ajuste de confiança: -0.1 (moderada)
└─ Timestamp: ${candle1.timestamp || 'N/A'}
        `);
        
        return {
          entryConfirmed: true,
          confirmationStrength: 'MODERATE',
          confidenceAdjustment: -0.1,
          entryPrice: close1,
          confirmationTime: candle1.timestamp || new Date().toISOString(),
          m1Strength: avgStrength,
          flipCandle: candle1,
        };
      }
      
      // SELL: 2 velas consecutivas fecham abaixo da linha
      if (direction === 'SELL' && close1 < triggerLine && close2 < triggerLine) {
        console.log(`
✅ ENTRADA CONFIRMADA MODERADA (SELL) - ${asset}:
├─ Tipo: 2 VELAS CONSECUTIVAS ABAIXO 📊
├─ Linha de gatilho: $${triggerLine.toFixed(4)}
├─ M1[1] Close: $${close1.toFixed(4)} (abaixo ✅)
├─ M1[2] Close: $${close2.toFixed(4)} (abaixo ✅)
├─ Força média: ${(avgStrength * 100).toFixed(1)}%
├─ Ajuste de confiança: -0.1 (moderada)
└─ Timestamp: ${candle1.timestamp || 'N/A'}
        `);
        
        return {
          entryConfirmed: true,
          confirmationStrength: 'MODERATE',
          confidenceAdjustment: -0.1,
          entryPrice: close1,
          confirmationTime: candle1.timestamp || new Date().toISOString(),
          m1Strength: avgStrength,
          flipCandle: candle1,
        };
      }
    }
  }
  
  // ============================================
  // NÍVEL 3: CONFIRMAÇÃO FRACA (3 velas consecutivas)
  // ============================================
  if (confirmationMode === 'WEAK') {
    for (let i = recent15m1.length - 1; i >= 2; i--) {
      const candle1 = recent15m1[i];
      const candle2 = recent15m1[i - 1];
      const candle3 = recent15m1[i - 2];
      
      const close1 = parseFloat(candle1.close);
      const close2 = parseFloat(candle2.close);
      const close3 = parseFloat(candle3.close);
      
      // BUY: 3 velas consecutivas fecham acima da linha
      if (direction === 'BUY' && close1 > triggerLine && close2 > triggerLine && close3 > triggerLine) {
        console.log(`
✅ ENTRADA CONFIRMADA FRACA (BUY) - ${asset}:
├─ Tipo: 3 VELAS CONSECUTIVAS ACIMA 📈
├─ Linha de gatilho: $${triggerLine.toFixed(4)}
├─ M1[1] Close: $${close1.toFixed(4)} (acima ✅)
├─ M1[2] Close: $${close2.toFixed(4)} (acima ✅)
├─ M1[3] Close: $${close3.toFixed(4)} (acima ✅)
├─ Ajuste de confiança: -0.2 (fraca)
└─ Timestamp: ${candle1.timestamp || 'N/A'}
        `);
        
        return {
          entryConfirmed: true,
          confirmationStrength: 'WEAK',
          confidenceAdjustment: -0.2,
          entryPrice: close1,
          confirmationTime: candle1.timestamp || new Date().toISOString(),
          m1Strength: 0.5,
          flipCandle: candle1,
        };
      }
      
      // SELL: 3 velas consecutivas fecham abaixo da linha
      if (direction === 'SELL' && close1 < triggerLine && close2 < triggerLine && close3 < triggerLine) {
        console.log(`
✅ ENTRADA CONFIRMADA FRACA (SELL) - ${asset}:
├─ Tipo: 3 VELAS CONSECUTIVAS ABAIXO 📉
├─ Linha de gatilho: $${triggerLine.toFixed(4)}
├─ M1[1] Close: $${close1.toFixed(4)} (abaixo ✅)
├─ M1[2] Close: $${close2.toFixed(4)} (abaixo ✅)
├─ M1[3] Close: $${close3.toFixed(4)} (abaixo ✅)
├─ Ajuste de confiança: -0.2 (fraca)
└─ Timestamp: ${candle1.timestamp || 'N/A'}
        `);
        
        return {
          entryConfirmed: true,
          confirmationStrength: 'WEAK',
          confidenceAdjustment: -0.2,
          entryPrice: close1,
          confirmationTime: candle1.timestamp || new Date().toISOString(),
          m1Strength: 0.5,
          flipCandle: candle1,
        };
      }
    }
  }
  
  console.log(`⏳ Aguardando confirmação M1 (${confirmationMode}) - ${asset}: Preço ainda não cruzou $${triggerLine.toFixed(4)}`);
  
  return {
    entryConfirmed: false,
    confirmationStrength: 'WEAK',
    confidenceAdjustment: -0.2,
    entryPrice: 0,
    confirmationTime: '',
    m1Strength: 0,
    flipCandle: null,
  };
}

// ============================================
// FUNÇÃO PRINCIPAL: ESTRATÉGIA H1+M15+M1 COM SWEEP
// ============================================
async function analyzeTechnicalStandalone(
  candles1m: any[],
  candles5m: any[],
  candles15m: any[],
  candles1h: any[],
  indicators: any,
  currentPrice: number,
  asset: string,
  session: string,
  supabase: any,
  userId: string
): Promise<any> {
  console.log(`\n🔎 ESTRATÉGIA H1+M15+M1 - ${asset}`);
  
  // ============================================
  // 🎯 PRIORIDADE 1: ESTRATÉGIA "ONE CANDLESTICK"
  // ============================================
  console.log(`\n🎯 Verificando estratégia One Candlestick para ${asset}...`);

  const oneCandlestickZone = detectOneCandlestickZone(candles15m, currentPrice, asset);

  if (oneCandlestickZone.valid && oneCandlestickZone.zone && oneCandlestickZone.direction) {
    console.log(`✅ Zona One Candlestick detectada: ${oneCandlestickZone.reason}`);
    
    // Validar entrada no M1
    const entryValidation = validateOneCandlestickEntry(
      candles1m,
      oneCandlestickZone.zone,
      oneCandlestickZone.direction,
      currentPrice,
      asset
    );

    if (entryValidation.valid && entryValidation.entry && entryValidation.stop && entryValidation.target) {
      console.log(`
🚀🚀🚀 ONE CANDLESTICK - ENTRADA APROVADA 🚀🚀🚀
├─ Asset: ${asset}
├─ Direção: ${oneCandlestickZone.direction}
├─ Confiança: ${(entryValidation.confidence * 100).toFixed(0)}%
├─ Entry: $${entryValidation.entry.toFixed(4)}
├─ Stop: $${entryValidation.stop.toFixed(4)}
├─ Target: $${entryValidation.target.toFixed(4)}
└─ Estratégia: ONE CANDLESTICK (PRIORIDADE MÁXIMA)
      `);

      const signal = oneCandlestickZone.direction === 'BUY' ? 'LONG' : 'SHORT';

      return {
        signal,
        direction: oneCandlestickZone.direction,
        confidence: entryValidation.confidence,
        risk: {
          entry: entryValidation.entry,
          stop: entryValidation.stop,
          target: entryValidation.target,
          rr_ratio: Math.abs(entryValidation.target - entryValidation.entry) / 
                    Math.abs(entryValidation.entry - entryValidation.stop)
        },
        notes: `One Candlestick: ${entryValidation.reason}`,
        c1Direction: null,
        volumeFactor: indicators.volume.factor,
        confirmation: `One Candlestick - ${oneCandlestickZone.direction}`,
        marketData: {
          price: currentPrice,
          zone: oneCandlestickZone.zone,
          strategy: 'ONE_CANDLESTICK'
        },
        rangeHigh: oneCandlestickZone.zone.high,
        rangeLow: oneCandlestickZone.zone.low,
      };
    } else {
      console.log(`⏳ Zona detectada, mas aguardando gatilho M1: ${entryValidation.reason}`);
    }
  } else {
    console.log(`❌ Nenhuma zona One Candlestick: ${oneCandlestickZone.reason}`);
  }

  // ============================================
  // SE ONE CANDLESTICK NÃO QUALIFICOU, USAR LÓGICA ATUAL (VIA EXPRESSA + COUNTER-TREND)
  // ============================================
  console.log(`\n🔄 One Candlestick não qualificou - Verificando estratégia atual (Sweep + Via Expressa)...`);
  
  // ============================================
  // ETAPA 1: ANALISAR ESTRUTURA H1
  // ==========================================
  
  // ==========================================
  // PASSO 0.5: VALIDAÇÃO CRÍTICA - JANELA DE OPERAÇÃO (5 MINUTOS) - SWEEP
  // ==========================================
  console.log(`\n📍 PASSO 0.5: Validando JANELA DE OPERAÇÃO - SWEEP (CRÍTICO)...`);

  // Buscar foundation do SWEEP para esta sessão
  const { getOrCreateFoundation: getOrCreateSweepFoundation } = await import('./sweep-foundation.ts');
  const sweepFoundation = await getOrCreateSweepFoundation(session, candles5m, userId, supabase);

  if (!sweepFoundation.valid) {
    console.log(`⏳ Foundation SWEEP ainda não disponível para ${session}`);
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      confidence: 0,
      notes: `Aguardando foundation SWEEP para ${session}`,
      risk: null,
      c1Direction: null,
      volumeFactor: indicators.volume.factor,
      confirmation: 'Foundation pendente',
      marketData: { price: currentPrice },
      rangeHigh: 0,
      rangeLow: 0,
    };
  }

  const foundationTime = new Date(sweepFoundation.timestamp).getTime();
  const currentTime = Date.now();
  const OPERATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
  const windowEnd = foundationTime + OPERATION_WINDOW_MS;

  console.log(`   ├─ Foundation SWEEP: ${new Date(foundationTime).toISOString()}`);
  console.log(`   ├─ Atual: ${new Date(currentTime).toISOString()}`);
  console.log(`   └─ Janela fecha: ${new Date(windowEnd).toISOString()}`);

  if (currentTime > windowEnd) {
    const minutesElapsed = Math.floor((currentTime - foundationTime) / 1000 / 60);
    
    console.log(`❌ JANELA FECHADA (SWEEP)! Foundation há ${minutesElapsed} minutos`);
    
    await supabase.from('session_history').insert({
      user_id: userId,
      session,
      pair: asset,
      cycle_phase: 'Execution',
      event_type: 'OPERATION_WINDOW_CLOSED',
      signal: 'STAY_OUT',
      direction: null,
      notes: `⏸️ SWEEP - Janela fechada. Foundation há ${minutesElapsed}min (limite: 5min)`,
      timestamp: new Date().toISOString(),
      market_data: {
        foundation: { 
          high: sweepFoundation.high, 
          low: sweepFoundation.low,
          timestamp: sweepFoundation.timestamp,
          session
        },
        window: {
          foundationTime: new Date(foundationTime).toISOString(),
          currentTime: new Date(currentTime).toISOString(),
          minutesElapsed
        }
      }
    });
    
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      confidence: 0,
      notes: `⏸️ SWEEP - JANELA FECHADA: Foundation há ${minutesElapsed}min. Apenas primeiros 5min permitidos.`,
      risk: null,
      c1Direction: null,
      volumeFactor: indicators.volume.factor,
      confirmation: 'Janela fechada',
      marketData: { 
        price: currentPrice,
        foundation: sweepFoundation,
        window: {
          foundationTime: new Date(foundationTime).toISOString(),
          currentTime: new Date(currentTime).toISOString(),
          minutesElapsed
        }
      },
      rangeHigh: sweepFoundation.high,
      rangeLow: sweepFoundation.low,
    };
  }

  const minutesRemaining = Math.floor((windowEnd - currentTime) / 1000 / 60);
  const secondsRemaining = Math.floor(((windowEnd - currentTime) % (60 * 1000)) / 1000);
  console.log(`✅ JANELA ABERTA (SWEEP): ${minutesRemaining}min ${secondsRemaining}s restantes`);
  
  const h1Structure = analyzeH1Structure(candles1h);
  
  // 🟢 FASE 3: H1 ESTRUTURA COMO REFERÊNCIA (NÃO BLOQUEIA)
  if (!h1Structure.validStructure) {
    console.log(`⚠️ ${asset}: Estrutura H1 inválida (range < 2%) - Prosseguindo com cautela`);
  }
  
  console.log(`
📏 ESTRUTURA H1 - ${asset}:
├─ Máxima Anterior: $${h1Structure.previousHigh.toFixed(4)}
├─ Mínima Anterior: $${h1Structure.previousLow.toFixed(4)}
├─ Mid-Range (Zona Proibida): $${h1Structure.midRange.toFixed(4)}
├─ Range: ${((h1Structure.previousHigh - h1Structure.previousLow) / h1Structure.previousLow * 100).toFixed(2)}%
├─ Sessão Oceania High: $${h1Structure.sessionHighs.oceania.toFixed(4)}
├─ Sessão Asia High: $${h1Structure.sessionHighs.asia.toFixed(4)}
├─ Sessão London High: $${h1Structure.sessionHighs.london.toFixed(4)}
└─ Níveis estruturais: ${h1Structure.structuralLevels.length}
  `);
  
  // ✅ VALIDAÇÃO CRÍTICA: Trabalhar DENTRO do range H1
  if (currentPrice < h1Structure.previousLow || currentPrice > h1Structure.previousHigh) {
    console.log(`
⚠️ ${asset}: Preço FORA do range H1 - NÃO OPERAR
├─ Preço atual: $${currentPrice.toFixed(4)}
├─ Range H1: $${h1Structure.previousLow.toFixed(4)} - $${h1Structure.previousHigh.toFixed(4)}
└─ Regra: Só operar DENTRO do range (entre máxima e mínima anteriores)
    `);
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      confidence: 0,
      notes: 'Preço fora do range H1 (não trabalhar nas extremidades)',
      risk: null,
      c1Direction: null,
      volumeFactor: indicators.volume.factor,
      confirmation: 'Fora do range H1',
      marketData: { price: currentPrice, h1Structure },
      rangeHigh: h1Structure.previousHigh,
      rangeLow: h1Structure.previousLow,
    };
  }
  
  // ============================================
  // ETAPA 2: DETECTAR SWEEP NO M15 (FLEXIBILIZADO)
  // ============================================
  // Determinar sensibilidade baseado na sessão atual
  const sessionName = session.toUpperCase().replace(' ', '_') as keyof typeof SENSITIVITY_CONFIG;
  const sessionConfig = SENSITIVITY_CONFIG[sessionName] || SENSITIVITY_CONFIG.OCEANIA;
  
  const sweepData = detectM15Sweep(candles15m, h1Structure, asset, sessionConfig.sweep);
  
  // 🟢 FASE 3: SWEEP OPCIONAL (adiciona confiança mas não bloqueia)
  let sweepConfidence = 0.6;
  
  if (!sweepData.sweepDetected) {
    console.log(`⚠️ ${asset}: Sem sweep - Confiança base: 60%`);
  } else {
    console.log(`✅ ${asset}: SWEEP ${sweepData.sweepType} detectado - Bônus de confiança!`);
    sweepConfidence += 0.2; // 60% → 80%
  }
  
  // ============================================
  // ETAPA 3: CONFIRMAR ENTRADA NO M1 (FLEXIBILIZADO)
  // ============================================
  console.log(`🔍 Verificando confirmação M1 (modo: ${sessionConfig.m1Confirmation})...`);
  const m1Confirmation = confirmM1Entry(candles1m, sweepData, asset, sessionConfig.m1Confirmation);
  
  if (!m1Confirmation.entryConfirmed) {
    console.log(`⏸️ ${asset}: Aguardando confirmação M1 (${sessionConfig.m1Confirmation})...`);
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      confidence: 0.5,
      notes: `Sweep ${sweepData.sweepType} detectado - aguardando confirmação M1 ${sessionConfig.m1Confirmation}`,
      risk: null,
      c1Direction: null,
      volumeFactor: indicators.volume.factor,
      confirmation: `Aguardando confirmação M1 (${sessionConfig.m1Confirmation})`,
      marketData: { price: currentPrice, h1Structure, sweep: sweepData },
      rangeHigh: h1Structure.previousHigh,
      rangeLow: h1Structure.previousLow,
    };
  }

  console.log(`
✅ CONFIRMAÇÃO M1 - ${asset}:
├─ Direção: ${sweepData.direction}
├─ Tipo de Sweep: ${sweepData.sweepType}
├─ Nível varrido M15: ${sweepData.levelType} = $${sweepData.sweptLevel.toFixed(4)}
├─ Pavio M15: ${sweepData.wickLength.toFixed(4)}
├─ Força vela M15: ${(sweepData.candleStrength * 100).toFixed(1)}%
├─ Confirmação M1: ${m1Confirmation.confirmationStrength}
├─ Entrada M1: $${m1Confirmation.entryPrice.toFixed(4)}
├─ Força M1: ${(m1Confirmation.m1Strength * 100).toFixed(1)}%
└─ Ajuste de confiança: ${m1Confirmation.confidenceAdjustment}
  `);
  
  // ============================================
  // 🔍 VALIDAÇÃO ENGULFING (NOVO)
  // ============================================
  console.log(`\n🔍 VALIDAÇÃO ENGULFING - ${asset}`);
  
  // Usar a última vela como referência de sweep
  const lastCandle = candles1m[candles1m.length - 1];
  const sweepCandle1m = {
    timestamp: parseFloat(lastCandle.timestamp),
    open: parseFloat(lastCandle.open),
    high: parseFloat(lastCandle.high),
    low: parseFloat(lastCandle.low),
    close: parseFloat(lastCandle.close),
    volume: parseFloat(lastCandle.volume),
  };
  
  // Converter direção de BUY/SELL para BUY/SELL
  const engulfingDirection: 'BUY' | 'SELL' = sweepData.direction === 'BUY' ? 'BUY' : 'SELL';
  
  const engulfingResult = await detectEngulfingAfterSweep(
    candles1m.map((c: any) => ({
      timestamp: parseFloat(c.timestamp),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    })),
    sweepCandle1m,
    engulfingDirection,
    asset
  );
  
  if (!engulfingResult.engulfingDetected || !engulfingResult.expressiveCandleConfirmed) {
    console.log(`❌ ${asset}: Sweep detectado mas SEM engulfing expressivo - CANCELAR`);
    return {
      signal: 'STAY_OUT',
      direction: sweepData.direction,
      confidence: 0,
      notes: `Sweep ${sweepData.sweepType} sem engulfing expressivo`,
      risk: null,
      c1Direction: null,
      volumeFactor: indicators.volume.factor,
      confirmation: 'Aguardando engulfing expressivo',
      marketData: { price: currentPrice, h1Structure, sweep: sweepData },
      rangeHigh: h1Structure.previousHigh,
      rangeLow: h1Structure.previousLow,
    };
  }
  
  console.log(`✅ ${asset}: ENGULFING EXPRESSIVO CONFIRMADO!`);
  
  // ============================================
  // VALIDAR TENDÊNCIA GERAL (CRÍTICO)
  // ============================================
  const direction = sweepData.direction!;
  const trendValidation = validateTrendDirection(candles1h, candles15m, indicators, direction, asset, sweepData, m1Confirmation);
  
  if (!trendValidation.valid) {
    console.log(`
❌ TRADE REJEITADO - ${asset}:
├─ Motivo: ${trendValidation.reason}
├─ Força da tendência: ${(trendValidation.trendStrength * 100).toFixed(1)}%
└─ Direção proposta: ${direction}
    `);
    return {
      signal: 'STAY_OUT',
      direction: direction,
      confidence: 0.4,
      notes: `Trade rejeitado: ${trendValidation.reason}`,
      risk: null,
      c1Direction: null,
      volumeFactor: indicators.volume.factor,
      confirmation: `Tendência contra o trade (Score: ${(trendValidation.trendStrength * 100).toFixed(1)}%)`,
      marketData: { price: currentPrice, h1Structure, sweepData, trendValidation },
      rangeHigh: h1Structure.previousHigh,
      rangeLow: h1Structure.previousLow,
    };
  }
  
  console.log(`✅ Tendência validada: ${trendValidation.reason}`);
  
  // ============================================
  // 🔴 FASE 1: CALCULAR SL/TP COM ATR (REALISTA)
  // ============================================
  const entry = m1Confirmation.entryPrice; // Usar preço confirmado no M1
  
  // Calcular ATR do M15 para stop dinâmico
  const atr15m = calculateATR(candles15m, 14);
  
  // Stop Loss: 1.5x ATR (espaço de respiração baseado em volatilidade)
  const stopDistance = atr15m * 1.5;
  const stopLoss = direction === 'BUY'
    ? entry - stopDistance
    : entry + stopDistance;
  
  // 🔴 FASE 1: R:R REALISTA (1.8:1)
  const targetDistance = stopDistance * 2.7; // ATR x 2.7 para R:R de 1.8:1
  const takeProfit = direction === 'BUY'
    ? entry + targetDistance
    : entry - targetDistance;
  
  const rrRatio = Math.abs((takeProfit - entry) / (entry - stopLoss));
  
  console.log(`
🎯 NÍVEIS RECALCULADOS COM ATR - ${asset}:
├─ ATR M15: $${atr15m.toFixed(4)}
├─ Entry: $${entry.toFixed(4)}
├─ Stop Loss: $${stopLoss.toFixed(4)} (${((stopDistance / entry) * 100).toFixed(2)}% - ATR x1.5)
├─ Take Profit: $${takeProfit.toFixed(4)} (${((targetDistance / entry) * 100).toFixed(2)}% - ATR x2.7)
├─ R:R Real: 1:${rrRatio.toFixed(2)}
└─ Potencial de lucro: ${((Math.abs(takeProfit - entry) / entry) * 100).toFixed(2)}%
  `);
  
  // 🟢 FASE 3: R:R mínimo tolerável (1.2:1)
  const minRR = 1.2;
  
  if (rrRatio < minRR) {
    console.log(`⚠️ R:R abaixo do mínimo (${rrRatio.toFixed(2)} < ${minRR}) - Mas prosseguindo (baseado em ATR)`);
  }
  
  const signal = direction === 'BUY' ? 'LONG' : 'SHORT';
  
  // ✅ Confiança: sweep (60-80%) + confirmação M1
  
  // ✅ Ajustar confiança pelo tipo de sweep
  if (sweepData.sweepType === 'PARTIAL') {
    sweepConfidence -= 0.05;
  } else if (sweepData.sweepType === 'NEAR') {
    sweepConfidence -= 0.10;
  }
  
  // ✅ Volume profile validation (se habilitado na sessão)
  const volumeProfile = calculateVolumeProfile(candles15m);
  const nearPOC = Math.abs(sweepData.sweptLevel - volumeProfile.poc) / volumeProfile.poc < 0.005;
  const inValueArea = sweepData.sweptLevel >= volumeProfile.valueAreaLow && 
                      sweepData.sweptLevel <= volumeProfile.valueAreaHigh;
  
  if (sessionConfig.requireVolume && (nearPOC || inValueArea)) {
    sweepConfidence += 0.05;
    console.log(`📊 Volume Profile: Sweep próximo a zona de alto volume (+0.05 confiança)`);
  }
  
  const finalConfidence = Math.min(0.95, Math.max(0.5, sweepConfidence));
  
  console.log(`
🎯 SETUP FINAL - ${asset}:
├─ Tipo de Sweep: ${sweepData.sweepType}
├─ Confirmação M1: ${m1Confirmation.confirmationStrength}
├─ Confiança Base: ${sweepConfidence.toFixed(2)}
├─ Confiança Final: ${finalConfidence.toFixed(2)}
└─ R:R: 1:${rrRatio.toFixed(2)} (min: ${minRR.toFixed(2)})
  `);
  
  return {
    signal,
    direction,
    confidence: finalConfidence,
    risk: {
      entry,
      stop: stopLoss,
      target: takeProfit,
      rr_ratio: rrRatio,
    },
    notes: `Estratégia H1+M15: Sweep de ${sweepData.levelType} confirmado com R:R ${rrRatio.toFixed(2)}`,
    c1Direction: null,
    volumeFactor: indicators.volume.factor,
    confirmation: `Sweep ${sweepData.levelType} + ${signal}`,
    marketData: {
      price: currentPrice,
      h1Structure,
      sweepData,
    },
    rangeHigh: h1Structure.previousHigh,
    rangeLow: h1Structure.previousLow,
  };
}

// ============================================
// 🔍 HELPER: VALIDAR ENGULFING PARA FASES FIMATHE
// ============================================
async function validateEngulfingForPhase(
  candles1m: any[],
  direction: 'BUY' | 'SELL',
  asset: string,
  phaseName: string
): Promise<{ valid: boolean; reason: string }> {
  console.log(`\n🔍 VALIDAÇÃO ENGULFING (${phaseName}) - ${asset}`);
  
  if (!candles1m || candles1m.length < 2) {
    return { valid: false, reason: 'Dados M1 insuficientes' };
  }
  
  // Usar a última vela como referência
  const lastCandle = candles1m[candles1m.length - 1];
  const sweepCandle1m = {
    timestamp: parseFloat(lastCandle.timestamp),
    open: parseFloat(lastCandle.open),
    high: parseFloat(lastCandle.high),
    low: parseFloat(lastCandle.low),
    close: parseFloat(lastCandle.close),
    volume: parseFloat(lastCandle.volume),
  };
  
  const engulfingResult = await detectEngulfingAfterSweep(
    candles1m.map((c: any) => ({
      timestamp: parseFloat(c.timestamp),
      open: parseFloat(c.open),
      high: parseFloat(c.high),
      low: parseFloat(c.low),
      close: parseFloat(c.close),
      volume: parseFloat(c.volume),
    })),
    sweepCandle1m,
    direction,
    asset
  );
  
  if (!engulfingResult.engulfingDetected || !engulfingResult.expressiveCandleConfirmed) {
    console.log(`❌ ${phaseName}: Sem engulfing expressivo`);
    return { 
      valid: false, 
      reason: `${phaseName} sem engulfing expressivo confirmado`
    };
  }
  
  console.log(`✅ ${phaseName}: ENGULFING EXPRESSIVO CONFIRMADO!`);
  return { valid: true, reason: `${phaseName} com engulfing expressivo` };
}


// ✅ FASE 2: Oceania - O Desenhista (CRÍTICO)
async function analyzeOceaniaPhase(candles1m: any[], candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any, supabase: any, userId: string) {
  const { volume, atr } = indicators;
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  // Calcular H1 structure para validação
  const h1Structure = analyzeH1Structure(candles1h);
  
  // Primeira hora de Oceania (00:00-01:00) - Detectar C1
  const isFirstHour = utcHour === 0;
  
  if (isFirstHour && candles15m.length >= 4) {
    const first4Candles = candles15m.slice(-4);
    const high = Math.max(...first4Candles.map((c: any) => parseFloat(c.high)));
    const low = Math.min(...first4Candles.map((c: any) => parseFloat(c.low)));
    const close = parseFloat(first4Candles[first4Candles.length - 1].close);
    
    const c1Direction = close > (high + low) / 2 ? 'LONG' : 'SHORT';
    const c1Confidence = volume.factor > 1.2 ? 0.75 : 0.60;
    
    // ✅ GRAVAR C1 no Session State
    await updateSessionState(supabase, userId, {
      c1_direction: c1Direction,
      c1_confidence: c1Confidence,
      oceania_high: high,
      oceania_low: low
    });
    
    console.log(`🎯 C1 Direction detectada: ${c1Direction} (confidence: ${c1Confidence})`);
    
    return {
      signal: 'STAY_OUT', // Apenas observar na primeira hora
      direction: c1Direction,
      c1Direction,
      volumeFactor: volume.factor,
      confirmation: `Oceania C1 detected: ${c1Direction}`,
      risk: null,
      confidence: c1Confidence,
      notes: `C1 Direction set: ${c1Direction}. High: ${high}, Low: ${low}`,
      marketData: { price: currentPrice, high, low },
      rangeHigh: null,
      rangeLow: null,
    };
  }
  
  // Operações de confirmação (01:00-03:00)
  if (!isFirstHour && sessionState?.c1_direction) {
    const c1Direction = sessionState.c1_direction;
    const trend = detectTrend(candles15m.slice(-8));
    
    // Confirmar se movimento está alinhado com C1
    const isAligned = trend.direction === c1Direction;
    const hasVolume = volume.factor > 1.1;
    const hasModerateVolume = volume.factor > 0.8; // ✅ Fallback para volume moderado
    
    console.log(`🔍 Oceania Confirmation Check:
  - C1 Direction: ${c1Direction}
  - Trend Direction: ${trend.direction}
  - Aligned: ${isAligned}
  - Volume Factor: ${volume.factor.toFixed(2)}
  - Trend Strength: ${trend.strength.toFixed(2)}
    `);
    
    // ✅ CRITÉRIOS MAIS PERMISSIVOS: trend.strength > 0.4 (era 0.5)
    if (isAligned && (hasVolume || hasModerateVolume) && trend.strength > 0.4) {
      
      // ✅ Validação final completa antes de aprovar
      const setupValidation = await validateTradeSetup(
        c1Direction === 'LONG' ? 'BUY' : 'SELL',
        currentPrice,
        candles1h,
        candles15m,
        indicators,
        h1Structure,
        asset
      );
      
      if (!setupValidation.valid) {
        console.log(`❌ ${asset}: Oceania C1 rejeitado - ${setupValidation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: c1Direction === 'LONG' ? 'BUY' : 'SELL',
          confidence: 0,
          notes: `Oceania C1 rejeitado: ${setupValidation.reason}`,
          phase: 'oceania_c1_rejected',
          timestamp: new Date().toISOString(),
        };
      }
      
      // 🔍 VALIDAR ENGULFING antes de aprovar  
      const engulfingValidation = await validateEngulfingForPhase(
        candles1m,
        c1Direction === 'LONG' ? 'BUY' : 'SELL',
        asset,
        'Oceania'
      );
      
      if (!engulfingValidation.valid) {
        console.log(`❌ ${asset}: Oceania - ${engulfingValidation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: c1Direction === 'LONG' ? 'BUY' : 'SELL',
          confidence: 0,
          notes: engulfingValidation.reason,
          phase: 'oceania_no_engulfing',
          timestamp: new Date().toISOString(),
        };
      }
      
      const stopLoss = c1Direction === 'LONG'
        ? currentPrice - (atr * 0.6)  // SCALPING: mais próximo
        : currentPrice + (atr * 0.6);
      
      const takeProfit = c1Direction === 'LONG'
        ? currentPrice + (atr * 0.9)  // SCALPING: target menor
        : currentPrice - (atr * 0.9);
      
      const rrRatio = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss);
      
      console.log(`  - R:R Ratio: ${rrRatio.toFixed(2)} (range: ${RR_RANGES.OCEANIA_CONFIRMATION.min}-${RR_RANGES.OCEANIA_CONFIRMATION.max})`);
      
      // ✅ FASE 6: Validar R:R específico para Oceania
      if (rrRatio >= RR_RANGES.OCEANIA_CONFIRMATION.min && rrRatio <= RR_RANGES.OCEANIA_CONFIRMATION.max) {
        console.log(`✅ Oceania confirmation trade APPROVED - ${c1Direction}`);
        return {
          signal: c1Direction,
          direction: c1Direction,
          c1Direction,
          volumeFactor: volume.factor,
          confirmation: `Oceania C1 confirmation trade + Engulfing`,
          risk: {
            entry: currentPrice,
            stop: stopLoss,
            target: takeProfit,
            rr_ratio: rrRatio,
          },
          confidence: 0.72, // ✅ Aumentado de 0.68
          notes: `Confirming C1 ${c1Direction} with volume ${volume.factor.toFixed(2)}x, strength ${trend.strength.toFixed(2)} + engulfing`,
          marketData: { price: currentPrice, atr },
          rangeHigh: null,
          rangeLow: null,
        };
      } else {
        console.log(`❌ R:R fora do range - rejeitando operação`);
      }
    } else {
      console.log(`❌ Critérios não atendidos - aguardando melhor setup`);
    }
  }
  
  return {
    signal: 'STAY_OUT',
    direction: sessionState?.c1_direction || 'NEUTRAL',
    c1Direction: sessionState?.c1_direction,
    volumeFactor: volume.factor,
    confirmation: 'Oceania - monitoring C1',
    risk: null,
    confidence: 0.5,
    notes: 'Oceania phase - observing market structure',
    marketData: { price: currentPrice },
    rangeHigh: null,
    rangeLow: null,
  };
}

// ✅ FASE 3: Asia - O Confirmador
async function analyzeAsiaPhase(candles1m: any[], candles5m: any[], candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any, supabase: any, userId: string) {
  const { rsi, volume, atr } = indicators;
  const c1Direction = sessionState?.c1_direction;
  
  // Calcular H1 structure para validação
  const h1Structure = analyzeH1Structure(candles1h);
  
  if (!c1Direction) {
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      c1Direction: null,
      volumeFactor: volume.factor,
      confirmation: 'Asia - waiting for C1 Direction from Oceania',
      risk: null,
      confidence: 0,
      notes: 'No C1 direction set by Oceania yet',
      marketData: { price: currentPrice },
      rangeHigh: null,
      rangeLow: null,
    };
  }
  
  // Analisar últimas 4 horas de Asia (16 velas de 15m)
  const asiaCandles = candles15m.slice(-16);
  const asiaTrend = detectTrend(asiaCandles);
  
  // Asia CONFIRMA C1
  if (asiaTrend.direction === c1Direction && asiaTrend.strength > 0.6) {
    await updateSessionState(supabase, userId, {
      asia_confirmation: 'CONFIRMED',
      asia_direction: c1Direction
    });
    
    console.log(`✅ Asia CONFIRMOU C1: ${c1Direction}`);
    
    // Operar na direção confirmada - SCALPING MODE
    if (volume.factor > 1.2) {
      const stopLoss = c1Direction === 'LONG'
        ? currentPrice - (atr * 0.6)  // TP/SL mais próximos para scalping
        : currentPrice + (atr * 0.6);
      
      const takeProfit = c1Direction === 'LONG'
        ? currentPrice + (atr * 0.9)  // Target menor para fechar rápido
        : currentPrice - (atr * 0.9);
      
      const rrRatio = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss);
      
      if (rrRatio >= RR_RANGES.ASIA_CONFIRMATION.min && rrRatio <= RR_RANGES.ASIA_CONFIRMATION.max) {
        
        // 🔍 VALIDAR ENGULFING antes de aprovar
        const engulfingValidation = await validateEngulfingForPhase(
          candles1m,
          c1Direction === 'LONG' ? 'BUY' : 'SELL',
          asset,
          'Asia Confirmação'
        );
        
        if (!engulfingValidation.valid) {
          console.log(`❌ ${asset}: Asia - ${engulfingValidation.reason}`);
          return {
            signal: 'STAY_OUT',
            direction: c1Direction,
            c1Direction,
            volumeFactor: volume.factor,
            confirmation: engulfingValidation.reason,
            risk: null,
            confidence: 0,
            notes: engulfingValidation.reason,
            marketData: { price: currentPrice, rsi, atr },
            rangeHigh: null,
            rangeLow: null,
          };
        }
        
        return {
          signal: c1Direction,
          direction: c1Direction,
          c1Direction,
          volumeFactor: volume.factor,
          confirmation: `Asia CONFIRMED Oceania C1: ${c1Direction} + Engulfing`,
          risk: {
            entry: currentPrice,
            stop: stopLoss,
            target: takeProfit,
            rr_ratio: rrRatio,
          },
          confidence: 0.78,
          notes: `Asia confirms C1 ${c1Direction} - strong alignment + engulfing`,
          marketData: { price: currentPrice, rsi, atr },
          rangeHigh: null,
          rangeLow: null,
        };
      }
    }
  }
  
  // Asia REVERTE C1
  else if (asiaTrend.direction !== c1Direction && asiaTrend.strength > 0.7) {
    const newDirection = asiaTrend.direction;
    
    // Validar setup de reversão
    const setupValidation = await validateTradeSetup(
      newDirection === 'LONG' ? 'BUY' : 'SELL',
      currentPrice,
      candles1h,
      candles15m,
      indicators,
      h1Structure,
      asset
    );
    
    if (!setupValidation.valid) {
      console.log(`❌ ${asset}: Asia C1 reversão rejeitada - ${setupValidation.reason}`);
      return {
        signal: 'STAY_OUT',
        direction: newDirection === 'LONG' ? 'BUY' : 'SELL',
        confidence: 0,
        notes: `Asia C1 reversão rejeitada: ${setupValidation.reason}`,
        phase: 'asia_c1_reversal_rejected',
        timestamp: new Date().toISOString(),
      };
    }
    
    await updateSessionState(supabase, userId, {
      c1_direction: newDirection, // ATUALIZA C1!
      asia_confirmation: 'REVERSED',
      asia_direction: newDirection
    });
    
    console.log(`🔄 Asia REVERTEU C1 de ${c1Direction} para ${newDirection}`);
    
    // Operar na NOVA direção - SCALPING MODE
    if (volume.factor > 1.3) {
      
      // 🔍 VALIDAÇÃO H1/M5 PROTOCOL
      const h1m5Validation = validateH1M5Entry(
        newDirection,
        currentPrice,
        candles1h,
        candles5m
      );
      
      if (!h1m5Validation.allowed) {
        console.log(`❌ ${h1m5Validation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: newDirection,
          c1Direction: newDirection,
          volumeFactor: volume.factor,
          confirmation: h1m5Validation.reason,
          risk: null,
          confidence: 0,
          notes: `Asia reversal detectado mas rejeitado por H1/M5: ${h1m5Validation.reason}`,
          marketData: { price: currentPrice },
          rangeHigh: null,
          rangeLow: null,
          h1Zones: h1m5Validation.h1Zones
        };
      }
      
      // ✅ H1/M5 APROVADO
      console.log(`✅ ${h1m5Validation.reason}`);
      
      const rrRatio = Math.abs(h1m5Validation.target! - h1m5Validation.entry!) / 
                       Math.abs(h1m5Validation.entry! - h1m5Validation.stop!);
      
      return {
        signal: newDirection,
        direction: newDirection,
        c1Direction: newDirection,
        volumeFactor: volume.factor,
        confirmation: `Asia REVERSED C1 to ${newDirection} + H1/M5 validado`,
        risk: {
          entry: h1m5Validation.entry,
          stop: h1m5Validation.stop,
          target: h1m5Validation.target,
          rr_ratio: rrRatio,
        },
        confidence: 0.78,
        notes: `Asia reversal validado por H1/M5: ${c1Direction} → ${newDirection}`,
        marketData: { price: currentPrice, rsi, atr },
        rangeHigh: null,
        rangeLow: null,
        h1Zones: h1m5Validation.h1Zones,
        pitchforkConfirmed: true
      };
    }
  }
  
  // Asia fraca - aguardar Londres
  return {
    signal: 'STAY_OUT',
    direction: c1Direction,
    c1Direction,
    volumeFactor: volume.factor,
    confirmation: 'Asia - weak momentum, waiting London',
    risk: null,
    confidence: 0.5,
    notes: `Asia trend weak (strength: ${asiaTrend.strength.toFixed(2)})`,
    marketData: { price: currentPrice, rsi },
    rangeHigh: null,
    rangeLow: null,
  };
}

// ✅ FASE 4: London - O Precificador
async function analyzeLondonPhase(candles1m: any[], candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any, supabase: any, userId: string) {
  const { rsi, vwma, ema, volume, atr } = indicators;
  const c1Direction = sessionState?.c1_direction;
  
  // Calcular H1 structure para validação
  const h1Structure = analyzeH1Structure(candles1h);
  
  // Calcular London Range (primeiras 8 velas = 2h)
  const londonCandles = candles15m.slice(-32); // 8h de dados
  const rangeHigh = Math.max(...londonCandles.map((c: any) => parseFloat(c.high)));
  const rangeLow = Math.min(...londonCandles.map((c: any) => parseFloat(c.low)));
  const rangeSize = rangeHigh - rangeLow;
  
  // ✅ GRAVAR London Range no Session State
  await updateSessionState(supabase, userId, {
    london_range_high: rangeHigh,
    london_range_low: rangeLow
  });
  
  console.log(`📏 London Range: ${rangeLow.toFixed(2)} - ${rangeHigh.toFixed(2)} (size: ${rangeSize.toFixed(2)})`);
  
  // Scalping dentro do range alinhado com C1
  const nearSupport = currentPrice <= rangeLow + (rangeSize * 0.2);
  const nearResistance = currentPrice >= rangeHigh - (rangeSize * 0.2);
  
  // LONG setup - bounce no suporte alinhado com C1
  if (nearSupport && c1Direction === 'LONG' && volume.factor > 1.1 && rsi < 45) {
    
    // Validar setup London LONG
    const setupValidation = await validateTradeSetup(
      'BUY',
      currentPrice,
      candles1h,
      candles15m,
      indicators,
      h1Structure,
      asset
    );
    
    if (!setupValidation.valid) {
      console.log(`❌ ${asset}: London LONG rejeitado - ${setupValidation.reason}`);
      return {
        signal: 'STAY_OUT',
        direction: 'BUY',
        confidence: 0,
        notes: `London LONG rejeitado: ${setupValidation.reason}`,
        phase: 'london_long_rejected',
        timestamp: new Date().toISOString(),
      };
    }
    
    const entry = currentPrice;
    const stop = rangeLow - (atr * 0.5);
    const target = (rangeHigh + rangeLow) / 2; // Meio do range
    const rrRatio = Math.abs(target - entry) / Math.abs(entry - stop);
    
    if (rrRatio >= RR_RANGES.LONDON_SCALP.min && rrRatio <= RR_RANGES.LONDON_SCALP.max) {
      
      // 🔍 VALIDAR ENGULFING antes de aprovar
      const engulfingValidation = await validateEngulfingForPhase(
        candles1m,
        'BUY',
        asset,
        'London LONG'
      );
      
      if (!engulfingValidation.valid) {
        console.log(`❌ ${asset}: London LONG - ${engulfingValidation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: 'LONG',
          c1Direction,
          volumeFactor: volume.factor,
          confirmation: engulfingValidation.reason,
          risk: null,
          confidence: 0,
          notes: engulfingValidation.reason,
          marketData: { price: currentPrice, rsi, vwma, ema },
          rangeHigh,
          rangeLow,
        };
      }
      
      return {
        signal: 'LONG',
        direction: 'LONG',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: 'London support bounce - aligned with C1 + Engulfing',
        risk: {
          entry,
          stop,
          target,
          rr_ratio: rrRatio,
        },
        confidence: 0.70,
        notes: `London scalp LONG from support ${rangeLow.toFixed(2)} + engulfing`,
        marketData: { price: currentPrice, rsi, vwma, ema },
        rangeHigh,
        rangeLow,
      };
    }
  }
  
  // SHORT setup - rejeição na resistência alinhado com C1
  if (nearResistance && c1Direction === 'SHORT' && volume.factor > 1.1 && rsi > 55) {
    
    // Validar setup London SHORT
    const setupValidation = await validateTradeSetup(
      'SELL',
      currentPrice,
      candles1h,
      candles15m,
      indicators,
      h1Structure,
      asset
    );
    
    if (!setupValidation.valid) {
      console.log(`❌ ${asset}: London SHORT rejeitado - ${setupValidation.reason}`);
      return {
        signal: 'STAY_OUT',
        direction: 'SELL',
        confidence: 0,
        notes: `London SHORT rejeitado: ${setupValidation.reason}`,
        phase: 'london_short_rejected',
        timestamp: new Date().toISOString(),
      };
    }
    
    const entry = currentPrice;
    const stop = rangeHigh + (atr * 0.5);
    const target = (rangeHigh + rangeLow) / 2;
    const rrRatio = Math.abs(entry - target) / Math.abs(stop - entry);
    
    if (rrRatio >= RR_RANGES.LONDON_SCALP.min && rrRatio <= RR_RANGES.LONDON_SCALP.max) {
      
      // 🔍 VALIDAR ENGULFING
      const engulfingValidation = await validateEngulfingForPhase(candles1m, 'SELL', asset, 'London SHORT');
      if (!engulfingValidation.valid) {
        return { signal: 'STAY_OUT', direction: 'SELL', c1Direction, volumeFactor: volume.factor, confirmation: engulfingValidation.reason, risk: null, confidence: 0, notes: engulfingValidation.reason, marketData: { price: currentPrice, rsi, vwma, ema }, rangeHigh, rangeLow };
      }
      
      return {
        signal: 'SHORT',
        direction: 'SHORT',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: 'London resistance rejection - aligned with C1 + Engulfing',
        risk: {
          entry,
          stop,
          target,
          rr_ratio: rrRatio,
        },
        confidence: 0.70,
        notes: `London scalp SHORT from resistance ${rangeHigh.toFixed(2)} + engulfing`,
        marketData: { price: currentPrice, rsi, vwma, ema },
        rangeHigh,
        rangeLow,
      };
    }
  }
  
  return {
    signal: 'STAY_OUT',
    direction: 'NEUTRAL',
    c1Direction,
    volumeFactor: volume.factor,
    confirmation: 'London - range consolidation',
    risk: null,
    confidence: 0.5,
    notes: `London range ${rangeLow.toFixed(2)} - ${rangeHigh.toFixed(2)}`,
    marketData: { price: currentPrice, rsi },
    rangeHigh,
    rangeLow,
  };
}

// ✅ FASE 5: NY - O Executor (Melhorado)
async function analyzeNYPhase(candles1m: any[], candles5m: any[], candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any) {
  const { rsi, vwma, ema, macd, volume, atr } = indicators;
  
  // Calcular H1 structure para validação
  const h1Structure = analyzeH1Structure(candles1h);
  
  const c1Direction = sessionState?.c1_direction;
  const londonHigh = sessionState?.london_range_high;
  const londonLow = sessionState?.london_range_low;
  const asiaConfirmation = sessionState?.asia_confirmation;
  
  if (!londonHigh || !londonLow) {
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      c1Direction,
      volumeFactor: volume.factor,
      confirmation: 'NY - waiting for London range data',
      risk: null,
      confidence: 0,
      notes: 'No London range available',
      marketData: { price: currentPrice },
      rangeHigh: null,
      rangeLow: null,
    };
  }
  
  // Aumentar confiança se Asia confirmou
  let baseConfidence = 0.85;
  if (asiaConfirmation === 'CONFIRMED') {
    baseConfidence = 0.92;
  } else if (asiaConfirmation === 'REVERSED') {
    baseConfidence = 0.88;
  }
  
  // Detectar breakouts
  const breakoutUp = currentPrice > londonHigh;
  const breakoutDown = currentPrice < londonLow;
  const volumeConfirmed = volume.factor > 1.5;
  
  const bullishAlignment = vwma > ema && macd > 0 && rsi < 70;
  const bearishAlignment = vwma < ema && macd < 0 && rsi > 30;
  
  // LONG breakout
  if (breakoutUp && volumeConfirmed && bullishAlignment) {
    // Apenas operar se alinhado com C1 ou Asia confirmou
    if (c1Direction === 'LONG' || asiaConfirmation === 'REVERSED') {
      
      // ✅ Validar setup NY LONG primeiro
      const setupValidation = await validateTradeSetup(
        'BUY',
        currentPrice,
        candles1h,
        candles15m,
        indicators,
        h1Structure,
        asset
      );
      
      if (!setupValidation.valid) {
        console.log(`❌ ${asset}: NY Breakout LONG rejeitado - ${setupValidation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: 'BUY',
          confidence: 0,
          notes: `NY Breakout LONG rejeitado: ${setupValidation.reason}`,
          phase: 'ny_breakout_long_rejected',
          timestamp: new Date().toISOString(),
        };
      }
      
      // 🔍 VALIDAÇÃO H1/M5 PROTOCOL
      const h1m5Validation = validateH1M5Entry(
        'LONG',
        currentPrice,
        candles1h,
        candles5m
      );
      
      if (!h1m5Validation.allowed) {
        console.log(`❌ NY LONG: ${h1m5Validation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: 'LONG',
          c1Direction,
          volumeFactor: volume.factor,
          confirmation: h1m5Validation.reason,
          risk: null,
          confidence: 0,
          notes: `NY breakout detectado mas rejeitado por H1/M5: ${h1m5Validation.reason}`,
          marketData: { price: currentPrice },
          rangeHigh: londonHigh,
          rangeLow: londonLow,
          h1Zones: h1m5Validation.h1Zones
        };
      }
      
      // ✅ H1/M5 APROVADO + 🔍 VALIDAR ENGULFING
      const engulfingValidation = await validateEngulfingForPhase(candles1m, 'BUY', asset, 'NY LONG');
      if (!engulfingValidation.valid) {
        return { signal: 'STAY_OUT', direction: 'LONG', c1Direction, volumeFactor: volume.factor, confirmation: engulfingValidation.reason, risk: null, confidence: 0, notes: engulfingValidation.reason, marketData: { price: currentPrice }, rangeHigh: londonHigh, rangeLow: londonLow };
      }
      
      const rrRatio = Math.abs(h1m5Validation.target! - h1m5Validation.entry!) / 
                       Math.abs(h1m5Validation.entry! - h1m5Validation.stop!);
      
      return {
        signal: 'LONG',
        direction: 'LONG',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: `NY breakout UP + H1/M5 validado + Engulfing - C1: ${c1Direction}, Asia: ${asiaConfirmation}`,
        risk: {
          entry: h1m5Validation.entry,
          stop: h1m5Validation.stop,
          target: h1m5Validation.target,
          rr_ratio: rrRatio,
        },
        confidence: baseConfidence,
        notes: `NY LONG breakout validado por H1/M5 - Suporte H1: ${h1m5Validation.h1Zones.support.toFixed(2)}`,
        marketData: { price: currentPrice, vwma, ema, macd, rsi },
        rangeHigh: londonHigh,
        rangeLow: londonLow,
        h1Zones: h1m5Validation.h1Zones,
        pitchforkConfirmed: true
      };
    }
  }
  
  // SHORT breakout
  if (breakoutDown && volumeConfirmed && bearishAlignment) {
    if (c1Direction === 'SHORT' || asiaConfirmation === 'REVERSED') {
      
      // ✅ Validar setup NY SHORT primeiro
      const setupValidation = await validateTradeSetup(
        'SELL',
        currentPrice,
        candles1h,
        candles15m,
        indicators,
        h1Structure,
        asset
      );
      
      if (!setupValidation.valid) {
        console.log(`❌ ${asset}: NY Breakout SHORT rejeitado - ${setupValidation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: 'SELL',
          confidence: 0,
          notes: `NY Breakout SHORT rejeitado: ${setupValidation.reason}`,
          phase: 'ny_breakout_short_rejected',
          timestamp: new Date().toISOString(),
        };
      }
      
      // 🔍 VALIDAÇÃO H1/M5 PROTOCOL
      const h1m5Validation = validateH1M5Entry(
        'SHORT',
        currentPrice,
        candles1h,
        candles5m
      );
      
      if (!h1m5Validation.allowed) {
        console.log(`❌ NY SHORT: ${h1m5Validation.reason}`);
        return {
          signal: 'STAY_OUT',
          direction: 'SHORT',
          c1Direction,
          volumeFactor: volume.factor,
          confirmation: h1m5Validation.reason,
          risk: null,
          confidence: 0,
          notes: `NY breakout detectado mas rejeitado por H1/M5: ${h1m5Validation.reason}`,
          marketData: { price: currentPrice },
          rangeHigh: londonHigh,
          rangeLow: londonLow,
          h1Zones: h1m5Validation.h1Zones
        };
      }
      
      // ✅ H1/M5 APROVADO + 🔍 VALIDAR ENGULFING
      const engulfingValidation = await validateEngulfingForPhase(candles1m, 'SELL', asset, 'NY SHORT');
      if (!engulfingValidation.valid) {
        return { signal: 'STAY_OUT', direction: 'SHORT', c1Direction, volumeFactor: volume.factor, confirmation: engulfingValidation.reason, risk: null, confidence: 0, notes: engulfingValidation.reason, marketData: { price: currentPrice }, rangeHigh: londonHigh, rangeLow: londonLow };
      }
      
      const rrRatio = Math.abs(h1m5Validation.entry! - h1m5Validation.target!) / 
                       Math.abs(h1m5Validation.stop! - h1m5Validation.entry!);
      
      return {
        signal: 'SHORT',
        direction: 'SHORT',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: `NY breakout DOWN + H1/M5 validado + Engulfing - C1: ${c1Direction}, Asia: ${asiaConfirmation}`,
        risk: {
          entry: h1m5Validation.entry,
          stop: h1m5Validation.stop,
          target: h1m5Validation.target,
          rr_ratio: rrRatio,
        },
        confidence: baseConfidence,
        notes: `NY SHORT breakout validado por H1/M5 - Resistência H1: ${h1m5Validation.h1Zones.resistance.toFixed(2)}`,
        marketData: { price: currentPrice, vwma, ema, macd, rsi },
        rangeHigh: londonHigh,
        rangeLow: londonLow,
        h1Zones: h1m5Validation.h1Zones,
        pitchforkConfirmed: true
      };
    }
  }
  
  return {
    signal: 'STAY_OUT',
    direction: 'NEUTRAL',
    c1Direction,
    volumeFactor: volume.factor,
    confirmation: 'NY - monitoring for breakout',
    risk: null,
    confidence: 0.5,
    notes: `NY waiting for breakout. London range: ${londonLow.toFixed(2)} - ${londonHigh.toFixed(2)}`,
    marketData: { price: currentPrice, rsi },
    rangeHigh: londonHigh,
    rangeLow: londonLow,
  };
}

// Helper: Detect trend direction and strength
function detectTrend(candles: any[]): { direction: string; strength: number } {
  if (candles.length < 4) {
    return { direction: 'NEUTRAL', strength: 0 };
  }
  
  const closes = candles.map((c: any) => parseFloat(c.close));
  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const percentChange = ((lastClose - firstClose) / firstClose) * 100;
  
  // Count bullish vs bearish candles
  let bullishCount = 0;
  let bearishCount = 0;
  
  for (const candle of candles) {
    const open = parseFloat(candle.open);
    const close = parseFloat(candle.close);
    if (close > open) bullishCount++;
    else if (close < open) bearishCount++;
  }
  
  const totalCandles = candles.length;
  const bullishRatio = bullishCount / totalCandles;
  const bearishRatio = bearishCount / totalCandles;
  
  if (bullishRatio > 0.6 && percentChange > 0.3) {
    return { direction: 'LONG', strength: Math.min(bullishRatio, 1) };
  } else if (bearishRatio > 0.6 && percentChange < -0.3) {
    return { direction: 'SHORT', strength: Math.min(bearishRatio, 1) };
  }
  
  return { direction: 'NEUTRAL', strength: 0 };
}

// ✅ Volume Profile: Calcular POC, Value Area e zonas HVN/LVN
function calculateVolumeProfile(candles: any[]): {
  poc: number;
  valueAreaHigh: number;
  valueAreaLow: number;
  hvnZones: number[];
  lvnZones: number[];
} {
  if (candles.length < 20) {
    const mid = parseFloat(candles[candles.length - 1].close);
    return { poc: mid, valueAreaHigh: mid, valueAreaLow: mid, hvnZones: [], lvnZones: [] };
  }

  // Agrupar volume por níveis de preço
  const priceVolumes = new Map<string, number>();
  const allPrices: number[] = [];

  for (const candle of candles) {
    const high = parseFloat(candle.high);
    const low = parseFloat(candle.low);
    const volume = parseFloat(candle.volume);
    
    // Dividir range do candle em níveis
    const levels = 5;
    const step = (high - low) / levels;
    
    for (let i = 0; i < levels; i++) {
      const price = low + (step * i);
      const priceKey = price.toFixed(2);
      priceVolumes.set(priceKey, (priceVolumes.get(priceKey) || 0) + (volume / levels));
      allPrices.push(price);
    }
  }

  // Encontrar POC (Point of Control) - preço com maior volume
  let maxVolume = 0;
  let poc = 0;
  
  priceVolumes.forEach((vol, priceStr) => {
    if (vol > maxVolume) {
      maxVolume = vol;
      poc = parseFloat(priceStr);
    }
  });

  // Calcular Value Area (70% do volume)
  const sortedByVolume = Array.from(priceVolumes.entries())
    .sort((a, b) => b[1] - a[1]);
  
  const totalVolume = Array.from(priceVolumes.values()).reduce((a, b) => a + b, 0);
  const targetVolume = totalVolume * 0.7;
  
  let accumulatedVolume = 0;
  const valueAreaPrices: number[] = [];
  
  for (const [priceStr, vol] of sortedByVolume) {
    accumulatedVolume += vol;
    valueAreaPrices.push(parseFloat(priceStr));
    if (accumulatedVolume >= targetVolume) break;
  }
  
  const valueAreaHigh = Math.max(...valueAreaPrices);
  const valueAreaLow = Math.min(...valueAreaPrices);

  // Detectar HVN (High Volume Nodes) e LVN (Low Volume Nodes)
  const avgVolume = totalVolume / priceVolumes.size;
  const hvnZones: number[] = [];
  const lvnZones: number[] = [];
  
  priceVolumes.forEach((vol, priceStr) => {
    if (vol > avgVolume * 1.5) {
      hvnZones.push(parseFloat(priceStr));
    } else if (vol < avgVolume * 0.5) {
      lvnZones.push(parseFloat(priceStr));
    }
  });

  return { poc, valueAreaHigh, valueAreaLow, hvnZones, lvnZones };
}

// ✅ Wyckoff: Detectar fase do ciclo e eventos
function detectWyckoffPhase(candles: any[], volumeProfile: any): {
  phase: string;
  events: string[];
  volumePriceRelation: string;
} {
  if (candles.length < 10) {
    return { phase: 'NEUTRAL', events: [], volumePriceRelation: 'NEUTRAL' };
  }

  const recentCandles = candles.slice(-10);
  const volumes = recentCandles.map((c: any) => parseFloat(c.volume));
  const closes = recentCandles.map((c: any) => parseFloat(c.close));
  const highs = recentCandles.map((c: any) => parseFloat(c.high));
  const lows = recentCandles.map((c: any) => parseFloat(c.low));
  
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const currentVolume = volumes[volumes.length - 1];
  const priceChange = closes[closes.length - 1] - closes[0];
  const priceRange = Math.max(...highs) - Math.min(...lows);
  
  const events: string[] = [];
  let phase = 'NEUTRAL';
  let volumePriceRelation = 'NEUTRAL';

  // Detectar acumulação/distribuição
  const isRangebound = priceRange / closes[0] < 0.02; // Variação < 2%
  const highVolume = currentVolume > avgVolume * 1.3;
  
  if (isRangebound && highVolume) {
    // Possível acumulação ou distribuição
    if (closes[closes.length - 1] > volumeProfile.poc) {
      phase = 'ACCUMULATION';
      events.push('Spring/Shakeout possível');
    } else {
      phase = 'DISTRIBUTION';
      events.push('UTAD (Upthrust) possível');
    }
  }
  
  // Detectar markup/markdown
  const strongTrend = Math.abs(priceChange) / closes[0] > 0.03; // Variação > 3%
  
  if (strongTrend && !isRangebound) {
    if (priceChange > 0) {
      phase = 'MARKUP';
      events.push('Fase bullish');
      volumePriceRelation = highVolume ? 'STRENGTH' : 'WEAKNESS';
    } else {
      phase = 'MARKDOWN';
      events.push('Fase bearish');
      volumePriceRelation = highVolume ? 'STRENGTH' : 'WEAKNESS';
    }
  }

  // Relação Volume-Preço
  if (Math.abs(priceChange) > closes[0] * 0.01) {
    if (currentVolume > avgVolume * 1.2) {
      volumePriceRelation = priceChange > 0 ? 'BUYING_PRESSURE' : 'SELLING_PRESSURE';
    } else {
      volumePriceRelation = 'LOW_CONVICTION';
    }
  }

  return { phase, events, volumePriceRelation };
}

// Calculate technical indicators
function calculateIndicators(candles5m: any[], candles15m: any[], candles1h: any[]) {
  const closes5m = candles5m.map((c: any) => parseFloat(c.close));
  const closes15m = candles15m.map((c: any) => parseFloat(c.close));
  const volumes5m = candles5m.map((c: any) => parseFloat(c.volume));

  const rsi = calculateRSI(closes5m, 14);
  const vwma = calculateVWMA(closes5m, volumes5m, 20);
  const ema = calculateEMA(closes15m, 21);
  const macd = calculateMACD(closes5m);
  const atr = calculateATR(candles5m, 14);

  // Volume analysis
  const avgVolume = volumes5m.reduce((a: number, b: number) => a + b, 0) / volumes5m.length;
  const currentVolume = volumes5m[volumes5m.length - 1];
  const volumeFactor = currentVolume / avgVolume;

  // Slope analysis (momentum)
  const recentCloses = closes5m.slice(-10);
  const slope = (recentCloses[recentCloses.length - 1] - recentCloses[0]) / recentCloses[0];

  // Trend detection
  const ema50 = calculateEMA(closes15m, 50);
  const trend = closes15m[closes15m.length - 1] > ema50 ? 'UP' : 'DOWN';

  return {
    rsi,
    vwma,
    ema,
    macd,
    atr,
    volume: { current: currentVolume, average: avgVolume, factor: volumeFactor },
    slope,
    trend,
  };
}

function calculateVWMA(prices: number[], volumes: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const recentPrices = prices.slice(-period);
  const recentVolumes = volumes.slice(-period);

  let sumPV = 0;
  let sumV = 0;

  for (let i = 0; i < period; i++) {
    sumPV += recentPrices[i] * recentVolumes[i];
    sumV += recentVolumes[i];
  }

  return sumV === 0 ? recentPrices[recentPrices.length - 1] : sumPV / sumV;
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const k = 2 / (period + 1);
  let ema = prices[0];

  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return ema;
}

function calculateMACD(prices: number[]): number {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  return ema12 - ema26;
}

// ✅ calculateATR já definido no topo do arquivo (linha ~79)

// ============================================
// (Classe BinanceRateLimiter movida para o topo do arquivo)
// ============================================

// ============================================
// FASE 5: PRIORIZAR PARES POR VOLATILIDADE
// ============================================
// Helper: Calcular RSI
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// Helper: Calcular ATR
function calculateATR(candles: any[], period: number = 14): number {
  if (candles.length < period + 1) return 0;
  
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }
  
  const recentTRs = trs.slice(-period);
  return recentTRs.reduce((sum, tr) => sum + tr, 0) / period;
}

// Sistema de Score Avançado (Multi-fator)
async function calculateAdvancedScore(pair: string): Promise<number> {
  let score = 0;
  
  try {
    // 1. VOLATILIDADE ÚTIL (ATR / Preço) - Peso 25%
    const candles1h = await fetchCandlesFromBinance(pair, ['1h']);
    if (!candles1h['1h'] || candles1h['1h'].length < 15) return 0;
    
    const atr = calculateATR(candles1h['1h'], 14);
    const currentPrice = candles1h['1h'][candles1h['1h'].length - 1].close;
    const atrPercent = (atr / currentPrice) * 100;
    score += Math.min(atrPercent * 25, 25); // Cap at 25
    
    // 2. LIQUIDEZ (Spread Bid/Ask) - Peso 20%
    const bookResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/bookTicker?symbol=${pair}`);
    const bookData = await bookResponse.json();
    const spread = ((parseFloat(bookData.askPrice) - parseFloat(bookData.bidPrice)) / parseFloat(bookData.bidPrice)) * 100;
    const liquidityScore = Math.max(0, 1 - spread * 10); // Spread menor = melhor
    score += liquidityScore * 20;
    
    // 3. MOMENTUM DIRECIONAL (RSI) - Peso 20%
    const closes = candles1h['1h'].map((c: any) => c.close);
    const rsi = calculateRSI(closes, 14);
    const momentumScore = Math.abs(rsi - 50) / 50; // Quanto mais extremo, melhor
    score += momentumScore * 20;
    
    // 4. VOLUME CONSISTENTE (últimas 4h vs 24h) - Peso 15%
    const ticker24h = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`);
    const data24h = await ticker24h.json();
    const volume24h = parseFloat(data24h.quoteVolume);
    const recentVolume = candles1h['1h'].slice(-4).reduce((sum: number, c: any) => sum + (c.volume * c.close), 0);
    const volumeConsistency = Math.min((recentVolume / volume24h) * 4, 1); // Normalizado
    score += volumeConsistency * 15;
    
    // 5. QUALIDADE DA FOUNDATION - Peso 20%
    const candles5m = await fetchCandlesFromBinance(pair, ['5m']);
    if (candles5m['5m'] && candles5m['5m'].length > 0) {
      const lastCandle5m = candles5m['5m'][candles5m['5m'].length - 1];
      const foundationRange = ((lastCandle5m.high - lastCandle5m.low) / lastCandle5m.low) * 100;
      
      if (foundationRange >= 0.3 && foundationRange <= 2.0) {
        score += 20; // Foundation ideal
      } else if (foundationRange > 2.0) {
        score += 10; // Muito volátil
      } else {
        score += 5; // Pouco range
      }
    }
    
    return score;
    
  } catch (error) {
    console.error(`❌ Erro ao calcular score para ${pair}:`, error);
    return 0;
  }
}

// Análise de Setup Readiness (OTIMIZADO COM PARALELIZAÇÃO)
async function analyzeSetupReadiness(pairs: string[]): Promise<string[]> {
  console.log(`\n🎯 Analisando setup readiness dos top 40 pares (timeout 25s)...`);
  
  const startTime = Date.now();
  const MAX_TIME = 25000; // 25s max
  const readyPairs: Array<{ pair: string; priority: number }> = [];
  
  // Paralelizar em batches de 10 para melhor performance
  const batchSize = 10;
  const pairsToAnalyze = pairs.slice(0, 40); // Reduzido de 50 para 40
  
  for (let i = 0; i < pairsToAnalyze.length; i += batchSize) {
    // Verificar timeout
    if (Date.now() - startTime > MAX_TIME) {
      console.log(`⏱️ Setup readiness timeout - analisados ${i}/${pairsToAnalyze.length} pares`);
      break;
    }
    
    const batch = pairsToAnalyze.slice(i, i + batchSize);
    
    // Paralelizar análise do batch
    const batchResults = await Promise.allSettled(
      batch.map(async (pair) => {
        await rateLimiter.checkAndWait();
        
        try {
          const candles1m = await fetchCandlesFromBinance(pair, ['1m']);
          const candles5m = await fetchCandlesFromBinance(pair, ['5m']);
          
          if (!candles1m['1m'] || candles1m['1m'].length < 10) return null;
          
          // Detectar FVG
          const recentCandles = candles1m['1m'].slice(-10);
          let hasFVG = false;
          
          for (let j = 2; j < recentCandles.length; j++) {
            const c1 = recentCandles[j - 2];
            const c2 = recentCandles[j - 1];
            const c3 = recentCandles[j];
            
            // FVG de baixa ou alta
            if (c1.low > c3.high || c1.high < c3.low) {
              hasFVG = true;
              break;
            }
          }
          
          let priority = 0;
          if (hasFVG) priority += 50;
          
          // Foundation válida
          if (candles5m['5m'] && candles5m['5m'].length > 0) {
            const lastCandle5m = candles5m['5m'][candles5m['5m'].length - 1];
            const range = ((lastCandle5m.high - lastCandle5m.low) / lastCandle5m.low) * 100;
            if (range >= 0.3 && range <= 2.0) {
              priority += 30;
            }
          }
          
          return priority > 0 ? { pair, priority } : null;
        } catch (error) {
          return null;
        }
      })
    );
    
    // Coletar resultados bem-sucedidos
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        readyPairs.push(result.value);
      }
    });
  }
  
  const sortedReady = readyPairs
    .sort((a, b) => b.priority - a.priority)
    .map(p => p.pair);
  
  console.log(`✅ ${sortedReady.length} pares com setups PRÓXIMOS detectados em ${((Date.now() - startTime)/1000).toFixed(1)}s`);
  if (sortedReady.length > 0) {
    console.log(`  Top 5 ready: ${sortedReady.slice(0, 5).join(', ')}`);
  }
  
  return sortedReady;
}

// Priorização com Score Avançado (OTIMIZADO COM PARALELIZAÇÃO)
async function prioritizePairs(pairs: string[]): Promise<string[]> {
  console.log(`\n🧠 SMART SCANNER: Analisando ${pairs.length} pares com score multi-fator (timeout 30s)...`);
  
  const startTime = Date.now();
  const MAX_TIME = 30000; // 30s max
  const pairData: Array<{ pair: string; score: number }> = [];
  
  // Paralelizar em batches de 15 para otimização
  const batchSize = 15;
  
  for (let i = 0; i < pairs.length; i += batchSize) {
    // Verificar timeout preventivo
    if (Date.now() - startTime > MAX_TIME) {
      console.log(`⏱️ Smart Scanner timeout - analisados ${i}/${pairs.length} pares`);
      break;
    }
    
    const batch = pairs.slice(i, i + batchSize);
    
    // Paralelizar cálculo de scores
    const batchResults = await Promise.allSettled(
      batch.map(async (pair) => {
        await rateLimiter.checkAndWait();
        const score = await calculateAdvancedScore(pair);
        return { pair, score };
      })
    );
    
    // Coletar resultados bem-sucedidos
    batchResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        pairData.push(result.value);
      }
    });
    
    // Log progressivo
    if (pairData.length % 30 === 0 || i + batchSize >= pairs.length) {
      console.log(`  Progresso: ${pairData.length}/${pairs.length} pares (${((Date.now() - startTime)/1000).toFixed(1)}s)`);
    }
  }
  
  const sortedPairs = pairData
    .sort((a, b) => b.score - a.score)
    .map(p => p.pair);
  
  console.log(`\n🏆 TOP 10 PARES POR SCORE (${pairData.length} analisados):`);
  pairData.slice(0, 10).forEach((p, idx) => {
    console.log(`  ├─ ${p.pair}: Score ${p.score.toFixed(2)}`);
  });
  
  return sortedPairs;
}

// ============================================
// FASE 1: EXPANDIR ANÁLISE COM CONTROLE DINÂMICO DE TEMPO (OTIMIZADO)
// ============================================
async function scanMarketForValidPairs(getRemainingTime?: () => number): Promise<string[]> {
  const now = Date.now();
  const scannerStartTime = now;
  const SCANNER_MAX_TIME = 45000; // 45s max para todo o scanner
  
  // ✅ FASE 3: Usar cache se ainda válido
  if (cachedPairs.length > 0 && (now - cacheTimestamp) < CACHE_TTL) {
    const remainingTTL = Math.floor((CACHE_TTL - (now - cacheTimestamp)) / 1000);
    console.log(`✅ Usando cache de pares (${cachedPairs.length} pares, válido por ${remainingTTL}s)`);
    return cachedPairs;
  }
  
  console.log('\n🔄 Cache expirado - buscando pares atualizados da Binance...');
  
  try {
    await rateLimiter.checkAndWait();
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const data = await response.json();

    const perpetualPairs = data.symbols.filter((s: any) => 
      s.symbol.endsWith('USDT') && 
      s.contractType === 'PERPETUAL' &&
      s.status === 'TRADING'
    );

    console.log(`📋 Total USDT perpetual pairs: ${perpetualPairs.length}`);

    // Get 24h stats for volume filtering
    await rateLimiter.checkAndWait();
    const statsResponse = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
    const stats = await statsResponse.json();
    const statsMap = new Map(stats.map((s: any) => [s.symbol, s]));

    // ✅ OTIMIZAÇÃO: Ordenar por volume e pegar top 50 de maior liquidez
    const pairsWithVolume = perpetualPairs
      .map((pair: any) => {
        const stat: any = statsMap.get(pair.symbol);
        if (!stat) return null;

        const volume24h = parseFloat(stat.quoteVolume);
        const priceChange = Math.abs(parseFloat(stat.priceChangePercent));

        // Critério base: $50M+ volume e 1%+ volatilidade
        if (volume24h < 50_000_000 || priceChange < 1.0) return null;

        return { symbol: pair.symbol, volume24h, priceChange };
      })
      .filter((p: any) => p !== null)
      .sort((a: any, b: any) => b.volume24h - a.volume24h) // Ordenar por volume DESC
      .slice(0, 50); // Top 50 de maior volume

    const validPairs = pairsWithVolume.map((p: any) => p.symbol);

    console.log(`🎯 Filtrados top ${validPairs.length} pares por volume (>= $50M, volatilidade >= 1.0%)`);
    
    console.log(`\n🚀 INICIANDO SMART SCANNER OTIMIZADO:`);
    console.log(`├─ Timeout máximo: 45s`);
    console.log(`├─ Pares candidatos: ${validPairs.length}`);
    console.log(`└─ Modo: Análise incremental com early exit\n`);
    
    // 🔒 FORÇAR INCLUSÃO DE BTCUSDT E ETHUSDT SEMPRE
    const mandatoryPairs = ['BTCUSDT', 'ETHUSDT'];
    const maxPairs = 10; // 🚀 Top 10 pares de maior volume (otimizado)
    
    // ✅ FASE 5: Priorizar pares por volatilidade e volume (COM TIMEOUT)
    const remainingTime1 = SCANNER_MAX_TIME - (Date.now() - scannerStartTime);
    const prioritizedPairs = remainingTime1 > 5000 
      ? await prioritizePairs(validPairs)
      : validPairs;
    
    // 🎯 NOVA LÓGICA: Priorizar pares com setups prontos (COM TIMEOUT)
    const remainingTime2 = SCANNER_MAX_TIME - (Date.now() - scannerStartTime);
    const readyPairs = remainingTime2 > 5000
      ? await analyzeSetupReadiness(prioritizedPairs)
      : [];
    
    // Combinar: Mandatory → Ready → Score (prioridade inteligente)
    const otherPairs = prioritizedPairs.filter((pair: string) => !mandatoryPairs.includes(pair));
    const orderedPairs = [
      ...readyPairs.filter((p: string) => !mandatoryPairs.includes(p)), // Setup ready primeiro
      ...otherPairs.filter((p: string) => !readyPairs.includes(p))      // Resto por score
    ];
    
    const finalPairs = [...mandatoryPairs, ...orderedPairs.slice(0, maxPairs - mandatoryPairs.length)];
    
    const scannerTotalTime = ((Date.now() - scannerStartTime) / 1000).toFixed(1);
    
    console.log(`\n📊 SMART SCANNER - RESULTADO FINAL:`);
    console.log(`├─ Tempo total: ${scannerTotalTime}s / 45s`);
    console.log(`├─ Total candidatos analisados: ${validPairs.length}`);
    console.log(`├─ Pares com setups ready: ${readyPairs.length}`);
    console.log(`├─ Pares selecionados: ${finalPairs.length}`);
    console.log(`├─ Mandatory: ${mandatoryPairs.join(', ')}`);
    console.log(`├─ Top Score: ${finalPairs.slice(2, 7).join(', ')}`);
    console.log(`└─ Ready setups: ${readyPairs.slice(0, 5).join(', ')}\n`);
    const rateLimitStatus = rateLimiter.getStats();
    console.log(`📊 Rate Limit: ${rateLimitStatus.current}/${rateLimitStatus.max} (${rateLimitStatus.percentage.toFixed(1)}%)`);
    
    // ✅ FASE 3: Atualizar cache
    cachedPairs = finalPairs;
    cacheTimestamp = now;
    
    return finalPairs;
  } catch (error) {
    console.error('❌ Erro ao escanear mercado:', error);
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT'];
  }
}

// Fetch candles from Binance (com rate limiting)
async function fetchCandlesFromBinance(symbol: string, intervals: string[]) {
  const candles: any = {};

  for (const interval of intervals) {
    try {
      await rateLimiter.checkAndWait(); // ✅ FASE 4: Rate limiting
      
      const limit = interval === '1h' ? 100 : interval === '15m' ? 96 : interval === '1m' ? 60 : 200;
      const response = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      const data = await response.json();

      candles[interval] = data.map((k: any) => ({
        timestamp: k[0],
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));
    } catch (error) {
      console.error(`Error fetching ${interval} candles for ${symbol}:`, error);
      candles[interval] = null;
    }
  }

  return candles;
}

// ============================================
// H1/M5 PROTOCOL MODULE
// ============================================

// Validate H1/M5 Entry - Core validation logic
function validateH1M5Entry(
  signal: string,
  currentPrice: number,
  candles1h: any[],
  candles5m: any[]
): {
  allowed: boolean;
  reason: string;
  h1Zones: any;
  pitchforkConfirmed: boolean;
  entry?: number;
  stop?: number;
  target?: number;
} {
  // 🔍 ETAPA 3: DEBUG H1/M5 PROTOCOL
  console.log(`
🔍 DEBUG H1/M5 PROTOCOL:
├─ Signal: ${signal}
├─ Current Price: $${currentPrice.toFixed(2)}
├─ H1 Candles: ${candles1h?.length || 0} períodos
├─ M5 Candles: ${candles5m?.length || 0} períodos
  `);
  
  if (candles1h && candles1h.length > 0) {
    const lastH1 = candles1h[candles1h.length - 1];
    console.log(`├─ Último H1: Open=${lastH1.open}, High=${lastH1.high}, Low=${lastH1.low}, Close=${lastH1.close}`);
  }
  
  if (candles5m && candles5m.length > 0) {
    const lastM5 = candles5m[candles5m.length - 1];
    console.log(`└─ Último M5: Open=${lastM5.open}, High=${lastM5.high}, Low=${lastM5.low}, Close=${lastM5.close}`);
  }
  
  const h1Zones = detectH1MagicLines(candles1h);
  const pricePosition = classifyPricePosition(currentPrice, h1Zones);
  
  // GOLDEN RULE: Only LONG at SUPPORT, only SHORT at RESISTANCE
  if (signal === 'LONG' || signal === 'SHORT') {
    if (signal === 'LONG' && pricePosition !== 'AT_SUPPORT') {
      return {
        allowed: false,
        reason: `LONG rejeitado - Preço em ${pricePosition}, aguardar SUPORTE H1 (${h1Zones.support.toFixed(2)})`,
        h1Zones,
        pitchforkConfirmed: false
      };
    }
  
    if (signal === 'SHORT' && pricePosition !== 'AT_RESISTANCE') {
      return {
        allowed: false,
        reason: `SHORT rejeitado - Preço em ${pricePosition}, aguardar RESISTÊNCIA H1 (${h1Zones.resistance.toFixed(2)})`,
        h1Zones,
        pitchforkConfirmed: false
      };
    }
  
    // Verify pitchfork pattern on M5
    const pitchfork = detectPitchforkPattern(candles5m, signal as 'LONG' | 'SHORT', h1Zones, 'PAIR');
  
    if (!pitchfork.confirmed) {
      return {
        allowed: false,
        reason: `Zona H1 OK, mas aguardando padrão pitchfork M5 (${pitchfork.status})`,
        h1Zones,
        pitchforkConfirmed: false
      };
    }
  
    // Calculate Stop/Target based on H1 + Pitchfork data
    const stop = pitchfork.stopLoss || (signal === 'LONG' ? h1Zones.support * 0.998 : h1Zones.resistance * 1.002);
    const target = signal === 'LONG' ? h1Zones.resistance : h1Zones.support;
    const entry = pitchfork.entryPrice || currentPrice;
  
    console.log(`
🔍 ========================================
   VALIDAÇÃO H1/M5 PROTOCOL
========================================
   FIMATHE Signal: ${signal}
   Preço Atual: ${currentPrice.toFixed(2)}
   
   📏 Linhas Mágicas H1:
   ├─ Resistência: ${h1Zones.resistance.toFixed(2)}
   ├─ Suporte: ${h1Zones.support.toFixed(2)}
   └─ Mid-Range: ${h1Zones.midRange.toFixed(2)}
   
   📍 Posição do Preço: ${pricePosition}
   
   ✅ ${pitchfork.status}
   
   📊 Níveis de Execução:
   ├─ Entry: ${entry.toFixed(2)}
   ├─ Stop: ${stop.toFixed(2)}
   ├─ Target: ${target.toFixed(2)}
   └─ R:R: ${(Math.abs(target - entry) / Math.abs(entry - stop)).toFixed(2)}
========================================
  `);
  
    return {
      allowed: true,
      reason: `✅ ZONA H1 + PITCHFORK M5 confirmados - ${signal} válido`,
      h1Zones,
      pitchforkConfirmed: true,
      entry,
      stop,
      target
    };
  }
  
  // Se não for LONG nem SHORT, retornar not allowed
  return {
    allowed: false,
    reason: 'Signal inválido - apenas LONG ou SHORT são suportados',
    h1Zones,
    pitchforkConfirmed: false
  };
}

// ============================================
// PRICE POSITION CLASSIFIER (usando novas Magic Lines)
// ============================================
function classifyPricePosition(
  price: number,
  zones: { resistance: number; support: number; midRange: number; breakoutAreas: number[]; validZones: boolean }
): 'AT_SUPPORT' | 'AT_RESISTANCE' | 'MID_RANGE' | 'APPROACHING_SUPPORT' | 'APPROACHING_RESISTANCE' {
  
  const rangeSize = zones.resistance - zones.support;
  const tolerance = rangeSize * 0.008; // 0.8% tolerance (mesma da checkTradingZone)
  
  // At support?
  if (Math.abs(price - zones.support) <= tolerance) {
    return 'AT_SUPPORT';
  }
  
  // At resistance?
  if (Math.abs(price - zones.resistance) <= tolerance) {
    return 'AT_RESISTANCE';
  }
  
  // Mid-range (NO-TRADE ZONE)?
  const distanceFromMid = Math.abs(price - zones.midRange);
  if (distanceFromMid < rangeSize * 0.25) {
    return 'MID_RANGE';
  }
  
  // Approaching which zone?
  return price > zones.midRange ? 'APPROACHING_RESISTANCE' : 'APPROACHING_SUPPORT';
}

// ============================================
// END OF H1/M5 PROTOCOL MODULE
// ============================================

// Execute trade signal with COMPLETE validation
async function executeTradeSignal(supabase: any, userId: string, asset: string, analysis: any, settings: any, currentSession: string) {
  try {
    console.log(`\n🔍 VALIDAÇÃO ESTRATÉGIA - ${asset}`);
    
    const { signal, risk, confidence, marketData } = analysis;
    
    // ✅ BYPASS: Se estratégia é ONE_CANDLESTICK, PULAR VALIDAÇÕES H1/M5
    if (marketData?.strategy === 'ONE_CANDLESTICK') {
      console.log(`
🎯 ONE CANDLESTICK DETECTADO - BYPASS DE VALIDAÇÕES H1/M5
├─ Estratégia: One Candlestick (prioridade máxima)
├─ Signal: ${signal}
├─ Confidence: ${(confidence * 100).toFixed(0)}%
└─ ✅ EXECUTANDO DIRETAMENTE (sem validação H1/M5)
      `);
      
      // Pular direto para cálculo de posição (logo após os logs)
    }
    
    // ✅ LOGS DE DEBUG
    console.log(`
🎯 ANÁLISE RECEBIDA:
├─ Asset: ${asset}
├─ Signal: ${signal}
├─ Confidence: ${(confidence * 100).toFixed(1)}%
├─ Entry: $${risk?.entry || 'N/A'}
├─ Stop Loss: $${risk?.stop || 'N/A'}
├─ Take Profit: $${risk?.target || 'N/A'}
├─ R:R: ${risk?.rr_ratio?.toFixed(2) || 'N/A'}
├─ Strategy: ${marketData?.strategy || 'N/A'}
└─ Session: ${currentSession}
    `);

    // ============================================
    // ✅ VALIDAÇÃO SIMPLIFICADA (Sweep + M1 já foram validados)
    // ============================================

    // ✅ H1 é APENAS REFERENCIAL (máxima/mínima anterior para contexto)
    console.log(`
📏 H1 REFERENCIAL:
├─ Máxima Anterior: $${marketData?.h1Structure?.previousHigh || 'N/A'}
├─ Mínima Anterior: $${marketData?.h1Structure?.previousLow || 'N/A'}
├─ Trading Zone: ${marketData?.tradingZone?.zone || 'N/A'}
└─ Status: Apenas referência, NÃO bloqueia execução ✅
    `);

    // ✅ TODAS as validações críticas JÁ foram feitas em analyzeMarket:
    // 1. Sweep detectado (TOTAL/PARTIAL/NEAR) ✅
    // 2. Confirmação M1 (STRONG/MODERATE/WEAK) ✅
    // 3. R:R mínimo aprovado (dinâmico por sweep type) ✅
    // 4. Cooldown verificado (30s baseado em operations) ✅
    // 5. Max positions verificado (single_position_mode) ✅

    console.log(`✅ VALIDAÇÕES COMPLETAS - Prosseguindo para execução`);

    // ============================================
    // VALIDAÇÃO COM IA (SE HABILITADA)
    // ============================================
    if (USE_AI_AGENTS) {
      console.log(`🤖 Validando com agentes IA...`);
      // [Código de validação IA aqui - não usado por enquanto]
    } else {
      console.log(`🔧 Agentes IA desabilitados - prosseguindo com validação técnica pura`);
    }

    // ============================================
    // CALCULAR TAMANHO DA POSIÇÃO
    // ============================================
    const balance = settings.balance || 100;
    const riskPercentage = (settings.risk_per_trade || 0.06) * 100; // ✅ CORRIGIDO: usar risk_per_trade do banco
    const leverage = settings.leverage || 20;
    
    // ✅ CORREÇÃO: Usar apenas riskPercentage (6%) do saldo
    const riskAmount = balance * (riskPercentage / 100); // Ex: $40 × 0.06 = $2.40
    const positionSize = riskAmount * leverage; // Ex: $2.40 × 20 = $48
    const quantity = positionSize / risk.entry; // Ex: $48 ÷ preço atual
    
    console.log(`
💰 CÁLCULO DE POSIÇÃO:
├─ Balance: $${balance}
├─ Risk Percentage: ${riskPercentage}%
├─ Risk Amount: $${riskAmount.toFixed(2)}
├─ Leverage: ${leverage}x
├─ Position Size: $${positionSize.toFixed(2)}
├─ Entry Price: $${risk.entry.toFixed(4)}
└─ Quantity: ${quantity.toFixed(4)} ${asset}
    `);

    // ============================================
    // ✅ VERIFICAÇÃO ANTI-DUPLICAÇÃO
    // ============================================

    console.log(`\n🔒 VERIFICAÇÃO ANTI-DUPLICAÇÃO para ${asset}...`);

    // 1️⃣ Verificar active_positions
    const { data: activePositions } = await supabase
      .from('active_positions')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', asset);

    if (activePositions && activePositions.length > 0) {
      console.log(`⚠️ BLOQUEADO: Já existe posição ativa em ${asset}`);
      console.log(`├─ Posições encontradas: ${activePositions.length}`);
      console.log(`└─ Entry: $${activePositions[0].entry_price}`);
      return false;
    }

    // 2️⃣ Verificar operations (fallback se active_positions vazia)
    const { data: openOperations } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', asset)
      .eq('result', 'OPEN')
      .order('created_at', { ascending: false })
      .limit(1);

    if (openOperations && openOperations.length > 0) {
      console.log(`⚠️ BLOQUEADO: Posição OPEN detectada em operations para ${asset}`);
      console.log(`├─ Entry: $${openOperations[0].entry_price}`);
      console.log(`└─ Opened: ${new Date(openOperations[0].entry_time).toISOString()}`);
      return false;
    }

    // 3️⃣ Verificar ordens recentes (últimos 5s) - prevenir duplicação simultânea
    const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
    const { data: recentOrders } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', userId)
      .eq('asset', asset)
      .gte('created_at', fiveSecondsAgo);

    if (recentOrders && recentOrders.length > 0) {
      console.log(`⚠️ BLOQUEADO: Ordem recente em ${asset} (últimos 5s) - evitando duplicação`);
      console.log(`├─ Ordens recentes: ${recentOrders.length}`);
      console.log(`└─ Última ordem: ${new Date(recentOrders[0].created_at).toISOString()}`);
      return false;
    }

    console.log(`✅ VERIFICAÇÃO ANTI-DUPLICAÇÃO: OK para executar ${asset}`);

    // ============================================
    // EXECUTAR ORDEM
    // ============================================
    // ✅ CONVERTER SIGNAL PARA DIRECTION VÁLIDO (BUY/SELL)
    const direction = signal.includes('BUY') || signal === 'LONG' ? 'BUY' : 'SELL';
    
    // Identificar estratégia usada
    const selectedStrategy = settings.trading_strategy || 'SWEEP_LIQUIDITY';
    
    const orderPayload = {
      user_id: userId,
      asset,
      direction, // ✅ Agora envia 'BUY' ou 'SELL' (não 'SHORT' ou 'LONG')
      quantity,
      price: risk.entry,
      stopLoss: risk.stop,
      takeProfit: risk.target,
      riskReward: (Math.abs(risk.target - risk.entry) / Math.abs(risk.entry - risk.stop)).toFixed(2),
      agents: {
        strategy: selectedStrategy,
        ...marketData,
      },
      session: currentSession,
    };

    console.log(`📤 Enviando ordem para binance-order...`);
    const orderResponse = await supabase.functions.invoke('binance-order', {
      body: orderPayload,
    });

    if (orderResponse.error) {
      console.error(`❌ Erro ao executar ordem:`, orderResponse.error);
      return false;
    }

    console.log(`✅ Ordem executada com sucesso para ${asset} - ${signal}`);
    
    // Registrar no agent_logs
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'trading-orchestrator',
      asset,
      status: 'success',
      data: {
        signal,
        confidence,
        validations_passed: 'sweep_m1_rr',
        risk,
        orderResponse: orderResponse.data,
      },
    });

    return true;
  } catch (error) {
    console.error(`❌ Error in executeTradeSignal:`, error);
    return false;
  }
}

// Calculate projected completion time for daily goals
async function calculateProjectedCompletionTime(
  totalOperations: number,
  targetOperations: number,
  startOfDayUTC: Date
): Promise<string | null> {
  // Se ainda não completou nenhuma operação, não há dados para projetar
  if (totalOperations === 0) {
    return null;
  }

  // Se já completou a meta, retornar o horário atual
  if (totalOperations >= targetOperations) {
    return new Date().toISOString();
  }

  const now = new Date();
  const elapsedMs = now.getTime() - startOfDayUTC.getTime();
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  // Calcular taxa de operações por hora
  const operationsPerHour = totalOperations / elapsedHours;

  // Se a taxa é muito baixa (< 0.1 ops/hora), não projetar
  if (operationsPerHour < 0.1) {
    return null;
  }

  // Calcular quantas operações faltam
  const remainingOperations = targetOperations - totalOperations;

  // Calcular quantas horas faltam
  const hoursNeeded = remainingOperations / operationsPerHour;

  // Calcular timestamp estimado
  const estimatedCompletionTime = new Date(now.getTime() + (hoursNeeded * 60 * 60 * 1000));

  console.log(`
⏱️ PROJEÇÃO DE TEMPO:
├─ Operações completadas: ${totalOperations}/${targetOperations}
├─ Tempo decorrido: ${elapsedHours.toFixed(2)}h
├─ Taxa: ${operationsPerHour.toFixed(2)} ops/hora
├─ Operações restantes: ${remainingOperations}
├─ Horas necessárias: ${hoursNeeded.toFixed(2)}h
└─ Estimativa: ${estimatedCompletionTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
  `);

  return estimatedCompletionTime.toISOString();
}

// ============================================================
// DETECTOR DE REVERSÃO DE PERNADA - CONFIRMAÇÃO RIGOROSA
// ============================================================
// Exige confirmação FORTE em múltiplos timeframes antes de sair
// O bot deve acompanhar a pernada completa até reversão CONFIRMADA
function detectLegReversal(
  candles5m: any[],
  candles15m: any[],
  currentDirection: 'BUY' | 'SELL',
  currentPrice: number,
  entryPrice: number
): { reversed: boolean; reason: string; confidence: number } {
  
  if (!candles5m || candles5m.length < 20 || !candles15m || candles15m.length < 10) {
    return { reversed: false, reason: '✅ Dados insuficientes - mantendo posição', confidence: 0 };
  }
  
  const last20_5m = candles5m.slice(-20);
  const last10_15m = candles15m.slice(-10);
  const last5_5m = candles5m.slice(-5);  // Confirmação recente
  const last3_15m = candles15m.slice(-3); // Confirmação recente
  
  // Contar velas em todo o período
  let bullish5m = 0, bearish5m = 0;
  last20_5m.forEach(c => {
    if (c.close > c.open) bullish5m++;
    else bearish5m++;
  });
  
  let bullish15m = 0, bearish15m = 0;
  last10_15m.forEach(c => {
    if (c.close > c.open) bullish15m++;
    else bearish15m++;
  });
  
  // Contar velas RECENTES (confirmação forte)
  let bullishRecent5m = 0, bearishRecent5m = 0;
  last5_5m.forEach(c => {
    if (c.close > c.open) bullishRecent5m++;
    else bearishRecent5m++;
  });
  
  let bullishRecent15m = 0, bearishRecent15m = 0;
  last3_15m.forEach(c => {
    if (c.close > c.open) bullishRecent15m++;
    else bearishRecent15m++;
  });
  
  // Estrutura de preço
  const highest5m = Math.max(...last20_5m.map(c => c.high));
  const lowest5m = Math.min(...last20_5m.map(c => c.low));
  const range5m = highest5m - lowest5m;
  const pricePosition5m = range5m > 0 ? (currentPrice - lowest5m) / range5m : 0.5;
  
  const highest15m = Math.max(...last10_15m.map(c => c.high));
  const lowest15m = Math.min(...last10_15m.map(c => c.low));
  const range15m = highest15m - lowest15m;
  const pricePosition15m = range15m > 0 ? (currentPrice - lowest15m) / range15m : 0.5;
  
  // =========================================
  // LONG REVERSAL - Reversão RIGOROSA
  // =========================================
  if (currentDirection === 'BUY') {
    const bearishRatio5m = bearish5m / 20;
    const bearishRatio15m = bearish15m / 10;
    const bearishRecentRatio5m = bearishRecent5m / 5;
    const bearishRecentRatio15m = bearishRecent15m / 3;
    
    // CRITÉRIOS PARA CONFIRMAÇÃO DE REVERSÃO:
    // 1. Dominância bearish forte (75%+ em M5, 70%+ em M15)
    // 2. Confirmação recente (80%+ das últimas velas bearish em ambos)
    // 3. Estrutura de preço quebrada (abaixo de 25% do range)
    // 4. Preço abaixo da entrada
    
    const strongBearishDominance = bearishRatio5m >= 0.75 && bearishRatio15m >= 0.70;
    const recentConfirmation = bearishRecentRatio5m >= 0.80 && bearishRecentRatio15m >= 0.67;
    const structureBroken = pricePosition5m < 0.25 && pricePosition15m < 0.30;
    const belowEntry = currentPrice < entryPrice;
    
    // REVERSÃO CONFIRMADA - todas as condições devem ser atendidas
    if (strongBearishDominance && recentConfirmation && structureBroken && belowEntry) {
      const confidence = (bearishRatio5m + bearishRatio15m + bearishRecentRatio5m + bearishRecentRatio15m) / 4;
      return {
        reversed: true,
        reason: `🔴 REVERSÃO CONFIRMADA (LONG→SHORT): M5 ${(bearishRatio5m*100).toFixed(0)}% bearish (recente ${(bearishRecentRatio5m*100).toFixed(0)}%), M15 ${(bearishRatio15m*100).toFixed(0)}% bearish (recente ${(bearishRecentRatio15m*100).toFixed(0)}%), Estrutura quebrada ${(pricePosition5m*100).toFixed(0)}% do range, Preço < Entrada`,
        confidence
      };
    }
    
    // Logging de monitoramento
    console.log(`📊 Monitorando pernada LONG:
├─ M5: ${(bearishRatio5m*100).toFixed(0)}% bearish (recente: ${(bearishRecentRatio5m*100).toFixed(0)}%) [precisa 75%+ geral, 80%+ recente]
├─ M15: ${(bearishRatio15m*100).toFixed(0)}% bearish (recente: ${(bearishRecentRatio15m*100).toFixed(0)}%) [precisa 70%+ geral, 67%+ recente]
├─ Estrutura: ${(pricePosition5m*100).toFixed(0)}% do range M5, ${(pricePosition15m*100).toFixed(0)}% do range M15 [precisa <25% e <30%]
└─ Preço vs Entrada: ${currentPrice.toFixed(4)} vs ${entryPrice.toFixed(4)} ${belowEntry ? '✓' : '✗'}`);
  }
  
  // =========================================
  // SHORT REVERSAL - Reversão RIGOROSA
  // =========================================
  if (currentDirection === 'SELL') {
    const bullishRatio5m = bullish5m / 20;
    const bullishRatio15m = bullish15m / 10;
    const bullishRecentRatio5m = bullishRecent5m / 5;
    const bullishRecentRatio15m = bullishRecent15m / 3;
    
    // CRITÉRIOS PARA CONFIRMAÇÃO DE REVERSÃO:
    // 1. Dominância bullish forte (75%+ em M5, 70%+ em M15)
    // 2. Confirmação recente (80%+ das últimas velas bullish em ambos)
    // 3. Estrutura de preço quebrada (acima de 75% do range)
    // 4. Preço acima da entrada
    
    const strongBullishDominance = bullishRatio5m >= 0.75 && bullishRatio15m >= 0.70;
    const recentConfirmation = bullishRecentRatio5m >= 0.80 && bullishRecentRatio15m >= 0.67;
    const structureBroken = pricePosition5m > 0.75 && pricePosition15m > 0.70;
    const aboveEntry = currentPrice > entryPrice;
    
    // REVERSÃO CONFIRMADA - todas as condições devem ser atendidas
    if (strongBullishDominance && recentConfirmation && structureBroken && aboveEntry) {
      const confidence = (bullishRatio5m + bullishRatio15m + bullishRecentRatio5m + bullishRecentRatio15m) / 4;
      return {
        reversed: true,
        reason: `🟢 REVERSÃO CONFIRMADA (SHORT→LONG): M5 ${(bullishRatio5m*100).toFixed(0)}% bullish (recente ${(bullishRecentRatio5m*100).toFixed(0)}%), M15 ${(bullishRatio15m*100).toFixed(0)}% bullish (recente ${(bullishRecentRatio15m*100).toFixed(0)}%), Estrutura quebrada ${(pricePosition5m*100).toFixed(0)}% do range, Preço > Entrada`,
        confidence
      };
    }
    
    // Logging de monitoramento
    console.log(`📊 Monitorando pernada SHORT:
├─ M5: ${(bullishRatio5m*100).toFixed(0)}% bullish (recente: ${(bullishRecentRatio5m*100).toFixed(0)}%) [precisa 75%+ geral, 80%+ recente]
├─ M15: ${(bullishRatio15m*100).toFixed(0)}% bullish (recente: ${(bullishRecentRatio15m*100).toFixed(0)}%) [precisa 70%+ geral, 67%+ recente]
├─ Estrutura: ${(pricePosition5m*100).toFixed(0)}% do range M5, ${(pricePosition15m*100).toFixed(0)}% do range M15 [precisa >75% e >70%]
└─ Preço vs Entrada: ${currentPrice.toFixed(4)} vs ${entryPrice.toFixed(4)} ${aboveEntry ? '✓' : '✗'}`);
  }
  
  return {
    reversed: false,
    reason: '✅ Pernada ainda intacta - aguardando confirmação de reversão',
    confidence: 0
  };
}

// ✅ TODAS AS FUNÇÕES DE MONITORAMENTO JÁ ESTÃO DEFINIDAS NO TOPO DO ARQUIVO
// monitorActivePositions (linha ~125) - Com trailing stop implementado
// calculateATR (linha ~79) - Cálculo de Average True Range  
// executeTradeSignal - Já implementada acima com risco adaptativo
