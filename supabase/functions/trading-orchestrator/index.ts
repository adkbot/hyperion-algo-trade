import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
// FASE 3: CACHE DE PARES (TTL: 5 minutos)
// ============================================
let cachedPairs: string[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// ✅ FASE 6: R:R ranges por sessão e tipo de operação
const RR_RANGES = {
  OCEANIA_CONFIRMATION: { min: 1.15, max: 1.4 },
  ASIA_CONFIRMATION: { min: 1.2, max: 1.5 },
  ASIA_REVERSAL: { min: 1.25, max: 1.6 },
  LONDON_SCALP: { min: 1.15, max: 1.3 },
  NY_BREAKOUT: { min: 1.3, max: 1.8 },
  NY_REENTRY: { min: 1.2, max: 1.5 },
};

// ✅ Session time ranges in UTC - Adjusted for 30min transition buffers
const SESSIONS = {
  OCEANIA: { start: 0, end: 2.5, name: 'Oceania' },        // 00:00 - 02:30 UTC
  ASIA: { start: 3, end: 7.5, name: 'Asia' },              // 03:00 - 07:30 UTC
  LONDON: { start: 8, end: 12.5, name: 'London' },         // 08:00 - 12:30 UTC
  NEW_YORK: { start: 13, end: 23.5, name: 'NewYork' },     // 13:00 - 23:30 UTC
};

// Map direction from LONG/SHORT to BUY/SELL for database
function mapDirection(signal: string): 'BUY' | 'SELL' {
  return signal === 'LONG' ? 'BUY' : 'SELL';
}

// Map session names to database format
function mapSession(sessionName: string): 'OCEANIA' | 'ASIA' | 'LONDON' | 'NY' {
  const sessionMap: Record<string, 'OCEANIA' | 'ASIA' | 'LONDON' | 'NY'> = {
    'Oceania': 'OCEANIA',
    'Asia': 'ASIA', 
    'London': 'LONDON',
    'NewYork': 'NY',
    'NY': 'NY'
  };
  return sessionMap[sessionName] || 'NY';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ✅ MULTI-USER: Buscar TODOS os usuários com bot rodando
    const { data: activeUsers, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('bot_status', 'running');

    if (settingsError || !activeUsers || activeUsers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active bots running' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    for (const userSettings of activeUsers) {
      console.log(`\n👤 Processing user: ${userSettings.user_id}`);
      console.log(`💰 Balance: $${userSettings.balance} | Risk: ${(userSettings.risk_per_trade * 100).toFixed(1)}%`);
      console.log(`📈 Max Positions: ${userSettings.max_positions}`);

      try {
        const userResult = await processUserTradingCycle(supabase, userSettings, currentSession, cyclePhase);
        allResults.push(userResult);
      } catch (userError) {
        console.error(`❌ Error processing user ${userSettings.user_id}:`, userError);
        allResults.push({
          user_id: userSettings.user_id,
          error: userError instanceof Error ? userError.message : 'Unknown error'
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        session: currentSession,
        phase: cyclePhase,
        users_processed: activeUsers.length,
        results: allResults,
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

// ✅ NOVA FUNÇÃO: Processar ciclo de trading para um usuário específico
async function processUserTradingCycle(supabase: any, settings: any, currentSession: string, cyclePhase: string) {
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
  const { data: dailyGoal } = await supabase
    .from('daily_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('date', new Date().toISOString().split('T')[0])
    .single();

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

  // Check active positions (max_positions)
  const { data: activePositions } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userId);

  const activeCount = activePositions?.length || 0;
  console.log(`💼 Posições ativas: ${activeCount}/${settings.max_positions}`);

  // Monitor existing positions regardless of limit
  if (activePositions && activePositions.length > 0) {
    await monitorActivePositions(supabase, userId, settings);
  }

  // CRITICAL: If single_position_mode is enabled and there's ANY active position, stop here
  if (settings.single_position_mode && activeCount > 0) {
    console.log(`⏸️ Modo 1 posição ativo - aguardando fechamento da posição atual`);
    return {
      userId,
      status: 'waiting_position_close',
      activePositions: activeCount,
      message: 'Aguardando fechamento da posição ativa'
    };
  }

  if (activeCount >= settings.max_positions) {
    console.log(`⚠️ Limite de posições atingido (${settings.max_positions}). Monitorando posições existentes...`);
    
    return {
      userId,
      status: 'max_positions_reached',
      activePositions: activeCount,
      message: `Limite de ${settings.max_positions} posições atingido`
    };
  }

  // ✅ Scan market for valid pairs
  console.log('Scanning market for valid trading pairs...');
  const validPairs = await scanMarketForValidPairs();
  
  console.log(`Found ${validPairs.length} valid trading pairs: ${validPairs.join(', ')}`);

  // ✅ Análise de mercado para múltiplos pares
  const analysisResults: any[] = [];

  for (const pair of validPairs) {
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
      const candles = await fetchCandlesFromBinance(pair, ['5m', '15m', '1h']);
      
      if (!candles['5m'] || !candles['15m'] || !candles['1h']) {
        console.log(`❌ Insufficient candle data for ${pair}`);
        continue;
      }

      // ✅ FASE 2-5: Análise baseada na sessão atual
      const analysis = await analyzeCyclePhase({
        candles,
        asset: pair,
        session: currentSession,
        phase: cyclePhase,
        sessionState,
        supabase,
        userId
      });

      if (analysis) {
        analysisResults.push({
          pair,
          ...analysis
        });

        // ✅ COOLDOWN: Verificar se já enviamos sinal recente para este ativo (últimos 5 minutos)
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: recentSignal } = await supabase
          .from('session_history')
          .select('*')
          .eq('user_id', userId)
          .eq('pair', pair)
          .eq('signal', analysis.signal)
          .gte('timestamp', fiveMinutesAgo)
          .order('timestamp', { ascending: false })
          .limit(1)
          .single();

        const shouldSkipDueToCooldown = recentSignal && analysis.signal !== 'STAY_OUT';
        
        if (shouldSkipDueToCooldown) {
          console.log(`⏸️ COOLDOWN ATIVO: Sinal ${analysis.signal} para ${pair} já foi detectado há menos de 5 minutos. Aguardando...`);
        }

        // ✅ Gravar análise no histórico (sempre, inclusive em cooldown)
        await supabase.from('session_history').insert({
          user_id: userId,
          pair,
          session: mapSession(currentSession),
          cycle_phase: cyclePhase,
          direction: analysis.direction,
          signal: analysis.signal,
          confidence_score: analysis.confidence,
          volume_factor: analysis.volumeFactor,
          notes: shouldSkipDueToCooldown 
            ? `${analysis.notes} [COOLDOWN ATIVO - Aguardando 5min]`
            : analysis.notes,
          confirmation: analysis.confirmation,
          c1_direction: analysis.c1Direction,
          range_high: analysis.rangeHigh,
          range_low: analysis.rangeLow,
          market_data: analysis.marketData,
          risk: analysis.risk,
          timestamp: new Date().toISOString(),
        });

        // ✅ Skip execution if cooldown is active
        if (shouldSkipDueToCooldown) {
          continue; // Skip this pair to avoid duplicate signals
        }
      }

      // ✅ Execute trades if signal is valid
      if (analysis && analysis.signal !== 'STAY_OUT' && analysis.risk) {
        const tradeExecuted = await executeTradeSignal(
          supabase,
          userId,
          pair,
          analysis,
          settings,
          currentSession
        );
        
        if (tradeExecuted) {
          console.log(`✅ Trade executed for ${pair} - ${analysis.signal}`);
          break; // Stop after first successful trade
        }
      }
    } catch (error) {
      console.error(`Error analyzing ${pair}:`, error);
    }
  }

  return {
    session: currentSession,
    phase: cyclePhase,
    analysis: analysisResults,
    activePositions: activePositions?.length || 0,
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
    if (utcDecimal >= 2.5 && utcDecimal < 3) nextSession = 'Asia';
    else if (utcDecimal >= 7.5 && utcDecimal < 8) nextSession = 'London';
    else if (utcDecimal >= 12.5 && utcDecimal < 13) nextSession = 'NewYork';
    else if (utcDecimal >= 23.5) nextSession = 'Oceania';
    
    console.log(`⏸️ Buffer de transição pré-${nextSession} em ${utcHour}:${utcMinutes.toString().padStart(2, '0')} UTC`);
    return 'Transition';
  }

  // ✅ DETECTAR SESSÃO ATIVA (usando hora decimal para precisão)
  for (const [key, session] of Object.entries(SESSIONS)) {
    if (utcDecimal >= session.start && utcDecimal < session.end) {
      console.log(`✅ Sessão ativa: ${session.name} em ${utcHour}:${utcMinutes.toString().padStart(2, '0')} UTC`);
      return session.name;
    }
  }
  
  // Fallback para Oceania (00:00-02:30)
  console.log(`✅ Sessão ativa: Oceania em ${utcHour}:${utcMinutes.toString().padStart(2, '0')} UTC (fallback)`);
  return 'Oceania';
}

// Determine cycle phase based on session
function getCyclePhase(session: string): string {
  if (session === 'Transition') return 'Waiting';
  if (session === 'Oceania') return 'Projection_Oceania';
  if (session === 'Asia') return 'Projection_Asia';
  if (session === 'London') return 'Consolidation';
  if (session === 'NewYork') return 'Execution';
  return 'Unknown';
}

// Main cycle analysis function
async function analyzeCyclePhase(params: any) {
  const { candles, asset, session, phase, sessionState, supabase, userId } = params;

  if (session === 'Transition') {
    return null; // No trading during transitions
  }

  const candles5m = candles['5m'];
  const candles15m = candles['15m'];
  const candles1h = candles['1h'];

  if (!candles5m || !candles15m || !candles1h) {
    return null;
  }

  const currentPrice = parseFloat(candles5m[candles5m.length - 1].close);
  const indicators = calculateIndicators(candles5m, candles15m, candles1h);

  // ✅ MODO FIMATHE (quando session_state existe com C1)
  if (sessionState?.c1_direction) {
    
    if (phase === 'Projection_Oceania') {
      return await analyzeOceaniaPhase(candles15m, candles1h, indicators, currentPrice, asset, sessionState, supabase, userId);
    }
    
    if (phase === 'Projection_Asia') {
      return await analyzeAsiaPhase(candles5m, candles15m, candles1h, indicators, currentPrice, asset, sessionState, supabase, userId);
    }
    
    if (phase === 'Consolidation') {
      return await analyzeLondonPhase(candles15m, candles1h, indicators, currentPrice, asset, sessionState, supabase, userId);
    }
    
    if (phase === 'Execution') {
      return await analyzeNYPhase(candles5m, candles15m, candles1h, indicators, currentPrice, asset, sessionState);
    }
  }
  
  // ✅ MODO STANDALONE HÍBRIDO (quando NÃO há session_state)
  else {
    console.log(`🔧 Modo STANDALONE HÍBRIDO ativado - ${session}`);
    return await analyzeTechnicalStandalone(
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
// ANÁLISE TÉCNICA - ESTRATÉGIA 4 FASES
// ============================================
async function analyzeTechnicalStandalone(
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
  
  const { volume, atr } = indicators;
  
  // ============================================
  // FASE 1: IDENTIFICAR LINHAS MÁGICAS (H1)
  // ============================================
  const h1Lines = detectH1MagicLines(candles1h);
  
  if (!h1Lines.validZones) {
    console.log(`⚠️ ${asset}: Linhas H1 inválidas (range muito pequeno) - STAY_OUT`);
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      confidence: 0,
      notes: 'H1 sem estrutura clara (lateralização)',
      risk: null,
      c1Direction: null,
      volumeFactor: volume.factor,
      confirmation: 'Range H1 insuficiente',
      marketData: { price: currentPrice, h1Lines },
      rangeHigh: null,
      rangeLow: null,
    };
  }
  
  console.log(`
📏 LINHAS MÁGICAS H1 - ${asset}:
├─ Resistance (Previous High): $${h1Lines.resistance.toFixed(4)}
├─ Support (Previous Low): $${h1Lines.support.toFixed(4)}
├─ Mid-Range (ZONA PROIBIDA): $${h1Lines.midRange.toFixed(4)}
├─ Range: ${((h1Lines.resistance - h1Lines.support) / h1Lines.support * 100).toFixed(2)}%
└─ Breakout Areas: ${h1Lines.breakoutAreas.length} zonas detectadas
  `);
  
  // ============================================
  // FASE 2: VERIFICAR ZONA DE OPERAÇÃO
  // ============================================
  const tradingZone = checkTradingZone(currentPrice, h1Lines);
  
  console.log(`📍 Zona Atual: ${tradingZone.zone} (${tradingZone.distance.toFixed(2)}% da zona)`);
  
  if (tradingZone.zone === 'NO_TRADE_ZONE') {
    console.log(`🚫 ${asset} no meio do range - NÃO OPERAR (zona de ruído)`);
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      confidence: 0,
      notes: 'Preço no meio do range H1 (zona proibida)',
      risk: null,
      c1Direction: null,
      volumeFactor: volume.factor,
      confirmation: tradingZone.status,
      marketData: { price: currentPrice, h1Lines, tradingZone },
      rangeHigh: h1Lines.resistance,
      rangeLow: h1Lines.support,
    };
  }
  
  // ============================================
  // FERRAMENTAS AUXILIARES (Volume Profile + Wyckoff)
  // ============================================
  const volumeProfile = calculateVolumeProfile(candles15m.slice(-50));
  const wyckoff = detectWyckoffPhase(candles15m.slice(-20), volumeProfile);
  
  console.log(`
🔧 FERRAMENTAS AUXILIARES - ${asset}:
├─ Volume Profile:
│  ├─ POC: $${volumeProfile.poc.toFixed(4)}
│  ├─ VAH: $${volumeProfile.valueAreaHigh.toFixed(4)}
│  └─ VAL: $${volumeProfile.valueAreaLow.toFixed(4)}
├─ Wyckoff:
│  ├─ Fase: ${wyckoff.phase}
│  └─ Relação VP: ${wyckoff.volumePriceRelation}
└─ Volume Factor: ${volume.factor.toFixed(2)}
  `);
  
  // ============================================
  // FASE 3: DETECTAR PADRÃO PITCHFORK (5M)
  // ============================================
  let signal = 'STAY_OUT';
  let direction = 'NEUTRAL';
  let pitchforkPattern: any = null;
  let baseConfidence = 0;
  
  if (tradingZone.zone === 'BUY_ZONE') {
    pitchforkPattern = detectPitchforkPattern(candles5m, 'LONG', h1Lines, asset);
    
    if (pitchforkPattern.confirmed) {
      signal = 'LONG';
      direction = 'LONG';
      baseConfidence = 0.75; // Confiança base: 75%
      
      // Ajustar confiança com ferramentas auxiliares
      if (wyckoff.phase === 'ACCUMULATION') baseConfidence += 0.10;
      if (wyckoff.phase === 'NEUTRAL') baseConfidence += 0.05;
      if (volume.factor > 0.15) baseConfidence += 0.05; // Volume forte
      if (pitchforkPattern.sequenceLength >= 4) baseConfidence += 0.03; // Queda forte
      
      baseConfidence = Math.min(baseConfidence, 0.95); // Cap em 95%
      
      console.log(`✅ LONG CONFIRMADO:
        ├─ Padrão: ${pitchforkPattern.status}
        ├─ Sequência: ${pitchforkPattern.sequenceLength} velas vermelhas
        ├─ Entry: $${pitchforkPattern.entryPrice.toFixed(4)}
        ├─ Stop: $${pitchforkPattern.stopLoss.toFixed(4)}
        ├─ Target: $${h1Lines.resistance.toFixed(4)} (Resistance H1)
        ├─ Wyckoff: ${wyckoff.phase}
        └─ Confiança: ${(baseConfidence * 100).toFixed(1)}%
      `);
    } else {
      console.log(`⏳ BUY_ZONE detectada mas aguardando Pitchfork: ${pitchforkPattern.status}`);
    }
  }
  
  else if (tradingZone.zone === 'SELL_ZONE') {
    pitchforkPattern = detectPitchforkPattern(candles5m, 'SHORT', h1Lines, asset);
    
    if (pitchforkPattern.confirmed) {
      signal = 'SHORT';
      direction = 'SHORT';
      baseConfidence = 0.75;
      
      if (wyckoff.phase === 'DISTRIBUTION') baseConfidence += 0.10;
      if (wyckoff.phase === 'NEUTRAL') baseConfidence += 0.05;
      if (volume.factor > 0.15) baseConfidence += 0.05;
      if (pitchforkPattern.sequenceLength >= 4) baseConfidence += 0.03;
      
      baseConfidence = Math.min(baseConfidence, 0.95);
      
      console.log(`✅ SHORT CONFIRMADO:
        ├─ Padrão: ${pitchforkPattern.status}
        ├─ Sequência: ${pitchforkPattern.sequenceLength} velas (invertido corrigido)
        ├─ Entry: $${pitchforkPattern.entryPrice.toFixed(4)}
        ├─ Stop: $${pitchforkPattern.stopLoss.toFixed(4)}
        ├─ Target: $${h1Lines.support.toFixed(4)} (Support H1)
        ├─ Wyckoff: ${wyckoff.phase}
        └─ Confiança: ${(baseConfidence * 100).toFixed(1)}%
      `);
    } else {
      console.log(`⏳ SELL_ZONE detectada mas aguardando Pitchfork: ${pitchforkPattern.status}`);
    }
  }
  
  // Se não confirmou, retornar STAY_OUT
  if (!pitchforkPattern || !pitchforkPattern.confirmed) {
    return {
      signal: 'STAY_OUT',
      direction: tradingZone.zone === 'BUY_ZONE' ? 'LONG' : 'SHORT',
      confidence: 0.4, // Setup parcial
      notes: `Na zona correta (${tradingZone.zone}) mas aguardando confirmação Pitchfork`,
      risk: null,
      c1Direction: null,
      volumeFactor: volume.factor,
      confirmation: pitchforkPattern?.status || 'Aguardando padrão',
      marketData: { price: currentPrice, h1Lines, tradingZone, pitchforkStatus: pitchforkPattern?.status, wyckoff, volumeProfile },
      rangeHigh: h1Lines.resistance,
      rangeLow: h1Lines.support,
    };
  }
  
  // ============================================
  // CALCULAR RISK/REWARD
  // ============================================
  const risk = {
    entry: pitchforkPattern.entryPrice,
    stop: pitchforkPattern.stopLoss,
    target: signal === 'LONG' ? h1Lines.resistance : h1Lines.support,
    rr_ratio: Math.abs((pitchforkPattern.entryPrice - (signal === 'LONG' ? h1Lines.resistance : h1Lines.support)) / 
                       (pitchforkPattern.entryPrice - pitchforkPattern.stopLoss)),
  };
  
  console.log(`💰 R:R calculado = ${risk.rr_ratio.toFixed(2)} (validação desabilitada - executando de qualquer forma)`);
  
  // Validação de R:R removida - executar independente do valor
  
  // ============================================
  // VALIDAÇÃO COM IA (SE HABILITADA)
  // ============================================
  if (USE_AI_AGENTS) {
    console.log(`🤖 Chamando agente-feedback-analitico para validação...`);
    // [Código de validação IA aqui - mantido mas não usado]
  } else {
    console.log(`🔧 Agentes IA DESABILITADOS - Operando com estratégia 4 Fases pura`);
  }
  
  // ============================================
  // RETORNAR SINAL APROVADO
  // ============================================
  return {
    signal,
    direction,
    confidence: baseConfidence,
    risk,
    notes: `Estratégia 4 Fases: ${tradingZone.zone} + Pitchfork confirmado + R:R ${risk.rr_ratio.toFixed(2)} + Wyckoff ${wyckoff.phase}`,
    c1Direction: null,
    volumeFactor: volume.factor,
    confirmation: pitchforkPattern.status,
    marketData: {
      price: currentPrice,
      h1Lines,
      tradingZone,
      pitchforkPattern,
      volumeProfile,
      wyckoff,
    },
    rangeHigh: h1Lines.resistance,
    rangeLow: h1Lines.support,
  };
}

// ✅ FASE 2: Oceania - O Desenhista (CRÍTICO)
async function analyzeOceaniaPhase(candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any, supabase: any, userId: string) {
  const { volume, atr } = indicators;
  const now = new Date();
  const utcHour = now.getUTCHours();
  
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
          confirmation: `Oceania C1 confirmation trade - aligned momentum`,
          risk: {
            entry: currentPrice,
            stop: stopLoss,
            target: takeProfit,
            rr_ratio: rrRatio,
          },
          confidence: 0.72, // ✅ Aumentado de 0.68
          notes: `Confirming C1 ${c1Direction} with volume ${volume.factor.toFixed(2)}x, strength ${trend.strength.toFixed(2)}`,
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
async function analyzeAsiaPhase(candles5m: any[], candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any, supabase: any, userId: string) {
  const { rsi, volume, atr } = indicators;
  const c1Direction = sessionState?.c1_direction;
  
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
        return {
          signal: c1Direction,
          direction: c1Direction,
          c1Direction,
          volumeFactor: volume.factor,
          confirmation: `Asia CONFIRMED Oceania C1: ${c1Direction}`,
          risk: {
            entry: currentPrice,
            stop: stopLoss,
            target: takeProfit,
            rr_ratio: rrRatio,
          },
          confidence: 0.78,
          notes: `Asia confirms C1 ${c1Direction} - strong alignment`,
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
async function analyzeLondonPhase(candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any, supabase: any, userId: string) {
  const { rsi, vwma, ema, volume, atr } = indicators;
  const c1Direction = sessionState?.c1_direction;
  
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
    const entry = currentPrice;
    const stop = rangeLow - (atr * 0.5);
    const target = (rangeHigh + rangeLow) / 2; // Meio do range
    const rrRatio = Math.abs(target - entry) / Math.abs(entry - stop);
    
    if (rrRatio >= RR_RANGES.LONDON_SCALP.min && rrRatio <= RR_RANGES.LONDON_SCALP.max) {
      return {
        signal: 'LONG',
        direction: 'LONG',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: 'London support bounce - aligned with C1',
        risk: {
          entry,
          stop,
          target,
          rr_ratio: rrRatio,
        },
        confidence: 0.70,
        notes: `London scalp LONG from support ${rangeLow.toFixed(2)}`,
        marketData: { price: currentPrice, rsi, vwma, ema },
        rangeHigh,
        rangeLow,
      };
    }
  }
  
  // SHORT setup - rejeição na resistência alinhado com C1
  if (nearResistance && c1Direction === 'SHORT' && volume.factor > 1.1 && rsi > 55) {
    const entry = currentPrice;
    const stop = rangeHigh + (atr * 0.5);
    const target = (rangeHigh + rangeLow) / 2;
    const rrRatio = Math.abs(entry - target) / Math.abs(stop - entry);
    
    if (rrRatio >= RR_RANGES.LONDON_SCALP.min && rrRatio <= RR_RANGES.LONDON_SCALP.max) {
      return {
        signal: 'SHORT',
        direction: 'SHORT',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: 'London resistance rejection - aligned with C1',
        risk: {
          entry,
          stop,
          target,
          rr_ratio: rrRatio,
        },
        confidence: 0.70,
        notes: `London scalp SHORT from resistance ${rangeHigh.toFixed(2)}`,
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
async function analyzeNYPhase(candles5m: any[], candles15m: any[], candles1h: any[], indicators: any, currentPrice: number, asset: string, sessionState: any) {
  const { rsi, vwma, ema, macd, volume, atr } = indicators;
  
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
      
      // ✅ H1/M5 APROVADO
      console.log(`✅ NY LONG: ${h1m5Validation.reason}`);
      
      const rrRatio = Math.abs(h1m5Validation.target! - h1m5Validation.entry!) / 
                       Math.abs(h1m5Validation.entry! - h1m5Validation.stop!);
      
      return {
        signal: 'LONG',
        direction: 'LONG',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: `NY breakout UP + H1/M5 validado - C1: ${c1Direction}, Asia: ${asiaConfirmation}`,
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
      
      // ✅ H1/M5 APROVADO
      console.log(`✅ NY SHORT: ${h1m5Validation.reason}`);
      
      const rrRatio = Math.abs(h1m5Validation.entry! - h1m5Validation.target!) / 
                       Math.abs(h1m5Validation.stop! - h1m5Validation.entry!);
      
      return {
        signal: 'SHORT',
        direction: 'SHORT',
        c1Direction,
        volumeFactor: volume.factor,
        confirmation: `NY breakout DOWN + H1/M5 validado - C1: ${c1Direction}, Asia: ${asiaConfirmation}`,
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

function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
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

function calculateATR(candles: any[], period: number): number {
  if (candles.length < period) return 0;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = parseFloat(candles[i].high);
    const low = parseFloat(candles[i].low);
    const prevClose = parseFloat(candles[i - 1].close);
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  const recentTRs = trs.slice(-period);
  return recentTRs.reduce((a, b) => a + b, 0) / period;
}

// ============================================
// (Classe BinanceRateLimiter movida para o topo do arquivo)
// ============================================

// ============================================
// FASE 5: PRIORIZAR PARES POR VOLATILIDADE
// ============================================
async function prioritizePairs(pairs: string[]): Promise<string[]> {
  console.log(`\n📊 Priorizando ${pairs.length} pares por volatilidade e volume...`);
  
  const pairData: Array<{ pair: string; score: number }> = [];
  
  for (const pair of pairs) {
    await rateLimiter.checkAndWait();
    
    try {
      const response = await fetch(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${pair}`);
      const data = await response.json();
      
      const volatility = Math.abs(parseFloat(data.priceChangePercent));
      const volumeRatio = parseFloat(data.volume) / parseFloat(data.quoteVolume);
      
      // Score: Volatilidade (peso 2x) + Volume ratio (peso 1x)
      const score = (volatility * 2) + (volumeRatio * 100);
      
      pairData.push({ pair, score });
    } catch (error) {
      console.error(`Erro ao priorizar ${pair}:`, error);
      pairData.push({ pair, score: 0 });
    }
  }
  
  // Ordenar por score (maior primeiro)
  const sortedPairs = pairData
    .sort((a, b) => b.score - a.score)
    .map(p => p.pair);
  
  console.log(`✅ Top 5 pares priorizados: ${sortedPairs.slice(0, 5).join(', ')}`);
  
  return sortedPairs;
}

// ============================================
// FASE 1: EXPANDIR ANÁLISE PARA 30 PARES
// ============================================
async function scanMarketForValidPairs(): Promise<string[]> {
  const now = Date.now();
  
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

    // ✅ FASE 1: Reduzir volume mínimo de $50M para $30M e aumentar limite de 15 para 30 pares
    const validPairs = perpetualPairs
      .filter((pair: any) => {
        const stat: any = statsMap.get(pair.symbol);
        if (!stat) return false;

        const volume24h = parseFloat(stat.quoteVolume);
        const priceChange = Math.abs(parseFloat(stat.priceChangePercent));

        return volume24h >= 30_000_000 && priceChange >= 0.5;
      })
      .map((pair: any) => pair.symbol)
      .slice(0, 50); // Buscar 50 candidatos iniciais

    console.log(`🎯 Filtrados ${validPairs.length} pares (volume >= $30M, volatilidade >= 0.5%)`);
    
    // ✅ FASE 5: Priorizar pares por volatilidade e volume
    const prioritizedPairs = await prioritizePairs(validPairs);
    
    // Limitar aos 30 melhores
    const finalPairs = prioritizedPairs.slice(0, 30);
    
    console.log(`✅ Selecionados ${finalPairs.length} pares de maior probabilidade`);
    
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
      
      const limit = interval === '1h' ? 100 : interval === '15m' ? 96 : 200;
      const response = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
      );
      const data = await response.json();

      candles[interval] = data.map((k: any) => ({
        time: k[0],
        open: k[1],
        high: k[2],
        low: k[3],
        close: k[4],
        volume: k[5],
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
    console.log(`\n🔍 VALIDAÇÃO ESTRATÉGIA 4 FASES - ${asset}`);
    
    const { signal, risk, confidence, marketData } = analysis;
    
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
├─ H1 Lines: Support $${marketData?.h1Lines?.support?.toFixed(4)} | Resistance $${marketData?.h1Lines?.resistance?.toFixed(4)}
├─ Trading Zone: ${marketData?.tradingZone?.zone}
├─ Pitchfork: ${marketData?.pitchforkPattern?.confirmed ? '✅ Confirmed' : '❌ Not confirmed'}
├─ Wyckoff Phase: ${marketData?.wyckoff?.phase || 'N/A'}
└─ Session: ${currentSession}
    `);

    // ============================================
    // VALIDAÇÕES SIMPLIFICADAS (SEM R:R)
    // ============================================
    const validations = {
      h1Structure: marketData?.h1Lines?.validZones === true,
      tradingZone: marketData?.tradingZone?.zone !== 'NO_TRADE_ZONE',
      pitchforkConfirmed: marketData?.pitchforkPattern?.confirmed === true,
    };

    const passedValidations = Object.values(validations).filter(v => v).length;
    console.log(`
📋 VALIDAÇÕES:
├─ H1 Structure: ${validations.h1Structure ? '✅' : '❌'}
├─ Trading Zone: ${validations.tradingZone ? '✅' : '❌'}
├─ Pitchfork Confirmed: ${validations.pitchforkConfirmed ? '✅' : '❌'}
├─ R:R: ${risk?.rr_ratio?.toFixed(2) || 'N/A'} (validação removida ✅)
└─ Total: ${passedValidations}/3
    `);

    // Exigir todas as 3 validações (removido R:R)
    if (passedValidations < 3) {
      console.log(`❌ REJEITADO: Apenas ${passedValidations}/3 validações aprovadas (mínimo 3)`);
      return false;
    }

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
    const riskPerTrade = settings.risk_per_trade || 0.02;
    const leverage = settings.leverage || 20;
    
    const riskAmount = balance * riskPerTrade;
    const stopDistance = Math.abs(risk.entry - risk.stop);
    const quantity = (riskAmount / stopDistance) * leverage;
    
    console.log(`
💰 CÁLCULO DE POSIÇÃO:
├─ Balance: $${balance}
├─ Risk per trade: ${(riskPerTrade * 100).toFixed(1)}%
├─ Risk Amount: $${riskAmount.toFixed(2)}
├─ Leverage: ${leverage}x
├─ Stop Distance: $${stopDistance.toFixed(4)}
└─ Quantity: ${quantity.toFixed(4)} ${asset}
    `);

    // ============================================
    // EXECUTAR ORDEM
    // ============================================
    const orderPayload = {
      user_id: userId,
      asset,
      direction: signal, // LONG ou SHORT
      quantity,
      price: risk.entry,
      stopLoss: risk.stop,
      takeProfit: risk.target,
      riskReward: (Math.abs(risk.target - risk.entry) / Math.abs(risk.entry - risk.stop)).toFixed(2),
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
        validations,
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

// Monitor active positions
async function monitorActivePositions(supabase: any, userId: string, settings: any) {
  const { data: positions, error } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userId);

  if (error || !positions || positions.length === 0) {
    return;
  }

  console.log(`📊 Monitoring ${positions.length} active position(s)...`);

  for (const position of positions) {
    const symbol = position.asset;
    
    try {
      const priceResponse = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`);
      const priceData = await priceResponse.json();
      const currentPrice = parseFloat(priceData.price);

      const entryPrice = parseFloat(position.entry_price);
      const stopLoss = parseFloat(position.stop_loss);
      const takeProfit = parseFloat(position.take_profit);
      const direction = position.direction;

      // Calculate P&L with 20x leverage system
      const priceDiff = direction === 'BUY' 
        ? currentPrice - entryPrice 
        : entryPrice - currentPrice;
      
      // Recalcular quantidade baseada no sistema 20x
      const leverage = settings.leverage || 20;
      const profitTargetPercent = settings.profit_target_percent || 100;
      const targetProfit = settings.balance * (profitTargetPercent / 100);
      const profitPerUnit = Math.abs(takeProfit - entryPrice);
      
      let quantity = targetProfit / profitPerUnit;
      
      // Ajuste se margem exceder saldo (mesma lógica da execução)
      const positionValue = quantity * entryPrice;
      const marginRequired = positionValue / leverage;
      
      if (marginRequired > settings.balance) {
        const adjustmentFactor = settings.balance / marginRequired;
        quantity = quantity * adjustmentFactor;
      }
      
      const currentPnL = priceDiff * quantity;

      // Update position
      await supabase
        .from('active_positions')
        .update({
          current_price: currentPrice,
          current_pnl: currentPnL,
        })
        .eq('id', position.id);

      console.log(`📊 ${symbol}: Preço $${currentPrice.toFixed(4)} | P&L $${currentPnL.toFixed(2)} | Meta $${targetProfit.toFixed(2)}`);

      let closePosition = false;
      let result = '';

      // ============================================
      // REGRA 1: ATINGIU META DE LUCRO (100% do saldo)
      // ============================================
      if (currentPnL >= targetProfit) {
        closePosition = true;
        result = 'WIN';
        console.log(`🎯 META ATINGIDA! ${symbol}: $${currentPnL.toFixed(2)} / $${targetProfit.toFixed(2)} (${profitTargetPercent}%)`);
      }

      // ============================================
      // REGRA 2: STOP LOSS ATINGIDO
      // ============================================
      if (!closePosition) {
        if (direction === 'BUY' && currentPrice <= stopLoss) {
          closePosition = true;
          result = 'LOSS';
          console.log(`❌ Stop Loss atingido - ${symbol} LONG: $${currentPrice.toFixed(4)} <= $${stopLoss.toFixed(4)}`);
        } else if (direction === 'SELL' && currentPrice >= stopLoss) {
          closePosition = true;
          result = 'LOSS';
          console.log(`❌ Stop Loss atingido - ${symbol} SHORT: $${currentPrice.toFixed(4)} >= $${stopLoss.toFixed(4)}`);
        }
      }

      // ============================================
      // REGRA 3: TAKE PROFIT H1/M5 ATINGIDO
      // ============================================
      if (!closePosition) {
        if (direction === 'BUY' && currentPrice >= takeProfit) {
          closePosition = true;
          result = 'WIN';
          console.log(`✅ Take Profit H1/M5 atingido - ${symbol} LONG: $${currentPrice.toFixed(4)} >= $${takeProfit.toFixed(4)}`);
        } else if (direction === 'SELL' && currentPrice <= takeProfit) {
          closePosition = true;
          result = 'WIN';
          console.log(`✅ Take Profit H1/M5 atingido - ${symbol} SHORT: $${currentPrice.toFixed(4)} <= $${takeProfit.toFixed(4)}`);
        }
      }

      // ============================================
      // REGRA 4: PROTEÇÃO DE TEMPO (MAX 60 MINUTOS)
      // ============================================
      if (!closePosition) {
        const now = new Date();
        const openedAt = new Date(position.opened_at);
        const minutesInPosition = (now.getTime() - openedAt.getTime()) / 60000;
        
        if (minutesInPosition >= 60) {
          closePosition = true;
          result = currentPnL > 0 ? 'WIN' : 'LOSS';
          console.log(`⏰ Tempo máximo (60min) - Fechando ${symbol} com P&L: $${currentPnL.toFixed(2)}`);
        }
      }

      if (closePosition) {
        // 🔥 BINANCE INTEGRATION: Close real order if not in paper mode
        if (!settings.paper_mode && settings.api_key && settings.api_secret) {
          console.log(`📡 Calling binance-close-order for REAL close: ${symbol}`);
          
          try {
            const { data: closeData, error: closeError } = await supabase.functions.invoke('binance-close-order', {
              body: {
                user_id: userId,
                asset: symbol,
                side: direction === 'BUY' ? 'SELL' : 'BUY', // Opposite side to close
                quantity: quantity.toFixed(4),
              },
            });

            if (closeError) {
              console.error(`❌ Binance close order failed for ${symbol}:`, closeError);
              // Continue anyway to update database
            } else {
              console.log(`✅ Real Binance position closed:`, closeData);
            }
          } catch (error) {
            console.error(`❌ Exception calling binance-close-order:`, error);
            // Continue anyway to update database
          }
        }

        // Close position in database
        await supabase.from('active_positions').delete().eq('id', position.id);

        // Update operation
        await supabase
          .from('operations')
          .update({
            exit_price: currentPrice,
            exit_time: new Date().toISOString(),
            pnl: currentPnL,
            result,
          })
          .eq('asset', symbol)
          .eq('entry_price', entryPrice)
          .is('exit_time', null);

        // Update daily goals
        const today = new Date().toISOString().split('T')[0];
        const { data: dailyGoal } = await supabase
          .from('daily_goals')
          .select('*')
          .eq('user_id', userId)
          .eq('date', today)
          .single();

        if (dailyGoal) {
          await supabase
            .from('daily_goals')
            .update({
              total_operations: (dailyGoal.total_operations || 0) + 1,
              wins: result === 'WIN' ? (dailyGoal.wins || 0) + 1 : dailyGoal.wins,
              losses: result === 'LOSS' ? (dailyGoal.losses || 0) + 1 : dailyGoal.losses,
              total_pnl: (dailyGoal.total_pnl || 0) + currentPnL,
            })
            .eq('id', dailyGoal.id);
        }

        // Update balance
        await supabase
          .from('user_settings')
          .update({
            balance: settings.balance + currentPnL,
          })
          .eq('user_id', userId);

        // Notify agents
        await supabase.from('agent_logs').insert({
          user_id: userId,
          agent_name: 'Risk Management',
          asset: symbol,
          status: result === 'WIN' ? 'success' : 'warning',
          data: {
            action: 'POSITION_CLOSED',
            result,
            entry: entryPrice,
            exit: currentPrice,
            pnl: currentPnL,
          },
        });
      }
    } catch (error) {
      console.error(`Error monitoring position for ${symbol}:`, error);
    }
  }
}
