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

// ✅ FASE 6: R:R ranges por sessão e tipo de operação
const RR_RANGES = {
  OCEANIA_CONFIRMATION: { min: 1.15, max: 1.4 },
  ASIA_CONFIRMATION: { min: 1.2, max: 1.5 },
  ASIA_REVERSAL: { min: 1.25, max: 1.6 },
  LONDON_SCALP: { min: 1.15, max: 1.3 },
  NY_BREAKOUT: { min: 1.3, max: 1.8 },
  NY_REENTRY: { min: 1.2, max: 1.5 },
};

// Session time ranges in UTC - CONTÍNUAS (24h cobertura)
const SESSIONS = {
  OCEANIA: { start: 0, end: 3, name: 'Oceania' },      // 00:00 - 03:00 UTC
  ASIA: { start: 3, end: 8, name: 'Asia' },            // 03:00 - 08:00 UTC
  LONDON: { start: 8, end: 13, name: 'London' },       // 08:00 - 13:00 UTC
  NEW_YORK: { start: 13, end: 24, name: 'NewYork' },   // 13:00 - 24:00 UTC
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
}

// ✅ NOVA FUNÇÃO: Processar ciclo de trading para um usuário específico
async function processUserTradingCycle(supabase: any, settings: any, currentSession: string, cyclePhase: string) {
  const userId = settings.user_id;
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

  // ✅ FASE 7: Carregar session state
  let sessionState = await getSessionState(supabase, userId);
  
  // Session State ausente - sistema usará análise técnica standalone
  if (!sessionState) {
    console.log(`ℹ️ Session State ausente - modo STANDALONE HÍBRIDO será ativado`);
  }
  
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
      // CRITICAL: Check if position was opened during this loop iteration
      if (settings.single_position_mode) {
        const { data: checkPositions } = await supabase
          .from('active_positions')
          .select('id')
          .eq('user_id', userId);
        
        if (checkPositions && checkPositions.length > 0) {
          console.log(`⏸️ Posição aberta durante análise - parando scan`);
          break;
        }
      }

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

        // ✅ Gravar análise no histórico
        await supabase.from('session_history').insert({
          user_id: userId,
          pair,
          session: mapSession(currentSession),
          cycle_phase: cyclePhase,
          direction: analysis.direction,
          signal: analysis.signal,
          confidence_score: analysis.confidence,
          volume_factor: analysis.volumeFactor,
          notes: analysis.notes,
          confirmation: analysis.confirmation,
          c1_direction: analysis.c1Direction,
          range_high: analysis.rangeHigh,
          range_low: analysis.rangeLow,
          market_data: analysis.marketData,
          risk: analysis.risk,
          timestamp: new Date().toISOString(),
        });
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

  // Check for 30-minute transition periods (2 x 15min candles)
  const isNearSessionTransition = (utcMinutes >= 30 && utcMinutes < 60 && 
    [2, 7, 12].includes(utcHour));

  if (isNearSessionTransition) {
    console.log('⏸️ Aguardando transição de sessão (30min safety)');
    return 'Transition'; // Special state - no trading
  }

  // Sessões agora cobrem 24h contínuas
  for (const [key, session] of Object.entries(SESSIONS)) {
    if (utcHour >= session.start && utcHour < session.end) {
      return session.name;
    }
  }
  
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

// ✅ ANÁLISE TÉCNICA STANDALONE HÍBRIDA (com Wyckoff + Volume Profile + validação IA)
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
  
  const { rsi, macd, volume, atr, trend } = indicators;
  
  // 1️⃣ DETECTAR TENDÊNCIA
  const recentTrend = detectTrend(candles15m.slice(-20));
  
  // 2️⃣ CALCULAR VOLUME PROFILE
  const volumeProfile = calculateVolumeProfile(candles15m.slice(-50));
  
  // 3️⃣ DETECTAR FASE WYCKOFF
  const wyckoff = detectWyckoffPhase(candles15m.slice(-20), volumeProfile);
  
  console.log(`📊 Standalone Analysis - ${asset}:
    Trend: ${recentTrend.direction} (${recentTrend.strength.toFixed(2)})
    RSI: ${rsi.toFixed(2)}
    MACD: ${macd.toFixed(4)}
    Volume Factor: ${volume.factor.toFixed(2)}
    POC: ${volumeProfile.poc.toFixed(2)}
    Value Area: ${volumeProfile.valueAreaLow.toFixed(2)} - ${volumeProfile.valueAreaHigh.toFixed(2)}
    Wyckoff Phase: ${wyckoff.phase}
    Volume-Price: ${wyckoff.volumePriceRelation}
  `);
  
  // 4️⃣ CRITÉRIOS DE ENTRADA LONG - RELAXADOS
  const nearPOC = Math.abs(currentPrice - volumeProfile.poc) / currentPrice < 0.01; // ±1% do POC
  const aboveVAL = currentPrice > volumeProfile.valueAreaLow;
  const belowVAH = currentPrice < volumeProfile.valueAreaHigh;
  
  const isLongSetup = (
    recentTrend.direction === 'LONG' &&
    recentTrend.strength > 0.55 && // ✅ Reduzido de 0.6 para 0.55
    rsi > 30 && rsi < 75 && // ✅ AMPLIADO ainda mais
    macd > 0 &&
    volume.factor > 0.05 && // ✅ MUITO REDUZIDO: mercado atual está em 0.06-0.38
    wyckoff.phase !== 'DISTRIBUTION' && // ✅ RELAXADO: permite NEUTRAL
    (wyckoff.volumePriceRelation === 'BUYING_PRESSURE' || wyckoff.volumePriceRelation === 'STRENGTH' || wyckoff.volumePriceRelation === 'NEUTRAL' || wyckoff.volumePriceRelation === 'LOW_CONVICTION')
  );
  
  // 5️⃣ CRITÉRIOS DE ENTRADA SHORT - RELAXADOS
  const isShortSetup = (
    recentTrend.direction === 'SHORT' &&
    recentTrend.strength > 0.55 && // ✅ Reduzido de 0.6 para 0.55
    rsi > 15 && rsi < 70 && // ✅ AMPLIADO ainda mais
    macd < 0 &&
    volume.factor > 0.05 && // ✅ MUITO REDUZIDO: mercado atual está em 0.06-0.38
    wyckoff.phase !== 'ACCUMULATION' && // ✅ RELAXADO: permite NEUTRAL
    (wyckoff.volumePriceRelation === 'SELLING_PRESSURE' || wyckoff.volumePriceRelation === 'STRENGTH' || wyckoff.volumePriceRelation === 'LOW_CONVICTION' || wyckoff.volumePriceRelation === 'NEUTRAL')
  );
  
  if (!isLongSetup && !isShortSetup) {
    console.log(`❌ Sem setup válido - aguardando condições`);
    return {
      signal: 'STAY_OUT',
      direction: 'NEUTRAL',
      c1Direction: null,
      volumeFactor: volume.factor,
      confirmation: 'Aguardando setup técnico válido',
      risk: null,
      confidence: 0.3,
      notes: `Standalone: Sem confluência. Wyckoff: ${wyckoff.phase}, VP Relation: ${wyckoff.volumePriceRelation}`,
      marketData: { price: currentPrice, rsi, macd, atr, wyckoff, volumeProfile },
      rangeHigh: null,
      rangeLow: null,
    };
  }
  
  // 6️⃣ CALCULAR STOP/TARGET COM ATR
  let signal = 'STAY_OUT';
  let direction = 'NEUTRAL';
  let risk = null;
  let baseConfidence = 0.65;
  
  if (isLongSetup) {
    signal = 'LONG';
    direction = 'LONG';
    
    // Stop logo abaixo do VAL ou 0.6 ATR (SCALPING)
    const stopLoss = Math.min(
      volumeProfile.valueAreaLow * 0.998,
      currentPrice - (atr * 0.6)  // Mais próximo para scalping
    );
    
    const takeProfit = currentPrice + (atr * 0.9);  // Target menor para fechar rápido
    const rrRatio = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss);
    
    risk = {
      entry: currentPrice,
      stop: stopLoss,
      target: takeProfit,
      rr_ratio: rrRatio,
    };
    
    baseConfidence = 0.65 + (recentTrend.strength * 0.10);
    
  } else if (isShortSetup) {
    signal = 'SHORT';
    direction = 'SHORT';
    
    // Stop logo acima do VAH ou 0.6 ATR (SCALPING)
    const stopLoss = Math.max(
      volumeProfile.valueAreaHigh * 1.002,
      currentPrice + (atr * 0.6)  // Mais próximo para scalping
    );
    
    const takeProfit = currentPrice - (atr * 0.9);  // Target menor para fechar rápido
    const rrRatio = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss);
    
    risk = {
      entry: currentPrice,
      stop: stopLoss,
      target: takeProfit,
      rr_ratio: rrRatio,
    };
    
    baseConfidence = 0.65 + (recentTrend.strength * 0.10);
  }
  
  // 7️⃣ VALIDAÇÃO COM AGENTE IA (Feedback Analítico)
  console.log(`🤖 Chamando agente-feedback-analitico para validação...`);
  
  try {
    const feedbackResponse = await fetch(AGENTE_FEEDBACK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        asset,
        session,
        phase: 'STANDALONE',
        signal: direction,
        confidence: baseConfidence,
        indicators: {
          rsi,
          macd,
          volume_factor: volume.factor,
          atr,
          trend: recentTrend,
        },
        volumeProfile: {
          poc: volumeProfile.poc,
          valueAreaHigh: volumeProfile.valueAreaHigh,
          valueAreaLow: volumeProfile.valueAreaLow,
        },
        wyckoff: {
          phase: wyckoff.phase,
          events: wyckoff.events,
          volumePriceRelation: wyckoff.volumePriceRelation,
        },
        price: currentPrice,
        risk,
      }),
    });
    
    if (feedbackResponse.ok) {
      const feedback = await feedbackResponse.json();
      
      console.log(`✅ Feedback IA recebido:
        Quality Score: ${feedback.qualityScore}
        Adjusted Confidence: ${feedback.adjustedConfidence}
        Recommendation: ${feedback.recommendation}
      `);
      
      // Registrar log do agente
      await supabase.from('agent_logs').insert({
        user_id: userId,
        agent_name: 'agente-feedback-analitico',
        asset,
        status: 'completed',
        data: {
          analysis: feedback.analysis,
          qualityScore: feedback.qualityScore,
          recommendation: feedback.recommendation,
        },
      });
      
      // Se IA rejeitar, não operar
      if (feedback.recommendation === 'REJEITAR') {
        console.log(`🚫 IA rejeitou o sinal - aguardando melhor oportunidade`);
        return {
          signal: 'STAY_OUT',
          direction: 'NEUTRAL',
          c1Direction: null,
          volumeFactor: volume.factor,
          confirmation: `IA rejeitou: ${feedback.analysis}`,
          risk: null,
          confidence: feedback.adjustedConfidence,
          notes: `Standalone rejeitado por IA. Quality: ${feedback.qualityScore}`,
          marketData: { price: currentPrice, rsi, macd, wyckoff, volumeProfile, aiAnalysis: feedback.analysis },
          rangeHigh: null,
          rangeLow: null,
        };
      }
      
      // Se IA pedir para aguardar
      if (feedback.recommendation === 'AGUARDAR') {
        console.log(`⏳ IA sugere aguardar - setup não está ideal`);
        return {
          signal: 'STAY_OUT',
          direction,
          c1Direction: null,
          volumeFactor: volume.factor,
          confirmation: `IA sugere aguardar: ${feedback.analysis}`,
          risk,
          confidence: feedback.adjustedConfidence,
          notes: `Standalone: IA pediu espera. Quality: ${feedback.qualityScore}`,
          marketData: { price: currentPrice, rsi, macd, wyckoff, volumeProfile, aiAnalysis: feedback.analysis },
          rangeHigh: null,
          rangeLow: null,
        };
      }
      
      // IA APROVOU - Executar com confiança ajustada
      console.log(`✅ IA aprovou sinal ${direction} - executando!`);
      
      return {
        signal,
        direction,
        c1Direction: null,
        volumeFactor: volume.factor,
        confirmation: `Standalone híbrido validado por IA: ${feedback.analysis}`,
        risk,
        confidence: feedback.adjustedConfidence, // Usar confiança ajustada pela IA
        notes: `Standalone: Wyckoff ${wyckoff.phase}, VP near POC, IA Quality ${feedback.qualityScore}`,
        marketData: { 
          price: currentPrice, 
          rsi, 
          macd, 
          atr, 
          wyckoff, 
          volumeProfile,
          aiAnalysis: feedback.analysis,
          aiQuality: feedback.qualityScore,
        },
        rangeHigh: null,
        rangeLow: null,
      };
      
    } else if (feedbackResponse.status === 402) {
      // 🆕 DETECÇÃO ESPECÍFICA DE FALTA DE CRÉDITOS LOVABLE AI
      console.warn(`⚠️ Lovable AI sem créditos (402) - OPERANDO EM MODO FALLBACK AUTOMÁTICO`);
      console.log(`
🔧 ========================================
   MODO FALLBACK ATIVADO - IA OFFLINE
   Razão: Sem créditos Lovable AI (402)
   Operando com: Análise Técnica Pura
   Confiança: ${(baseConfidence * 0.90).toFixed(1)}%
========================================
      `);
      
      // ✅ OPERAR IMEDIATAMENTE com análise técnica (90% da confiança base)
      return {
        signal,
        direction,
        c1Direction: null,
        volumeFactor: volume.factor,
        confirmation: `Standalone (IA sem créditos - operando técnico puro): ${session}`,
        risk,
        confidence: baseConfidence * 0.90, // 90% de confiança sem IA (melhor que outros erros)
        notes: `Standalone FALLBACK AUTO: Wyckoff ${wyckoff.phase}, análise técnica validada (IA 402 - sem créditos)`,
        marketData: { price: currentPrice, rsi, macd, atr, wyckoff, volumeProfile },
        rangeHigh: null,
        rangeLow: null,
      };
      
    } else {
      // Outros erros HTTP (500, 503, etc)
      console.warn(`⚠️ Erro ao chamar agente IA (status ${feedbackResponse.status}) - fallback ativo`);
      console.log(`
🔧 ========================================
   MODO FALLBACK ATIVADO - IA OFFLINE
   Razão: Erro de conexão (${feedbackResponse.status})
   Operando com: Análise Técnica Pura
   Confiança: ${(baseConfidence * 0.88).toFixed(1)}%
========================================
      `);
      
      // ✅ FALLBACK ROBUSTO: Se IA offline, executar com confiança reduzida
      return {
        signal,
        direction,
        c1Direction: null,
        volumeFactor: volume.factor,
        confirmation: `Standalone (IA offline - fallback ativo): ${session}`,
        risk,
        confidence: baseConfidence * 0.88, // 88% de confiança (penalidade maior para erros desconhecidos)
        notes: `Standalone FALLBACK: Wyckoff ${wyckoff.phase}, VP Relation ${wyckoff.volumePriceRelation} (IA offline, operando com análise técnica validada)`,
        marketData: { price: currentPrice, rsi, macd, atr, wyckoff, volumeProfile },
        rangeHigh: null,
        rangeLow: null,
      };
    }
    
  } catch (aiError) {
    console.error(`❌ Erro ao validar com IA:`, aiError);
    
    // ✅ FALLBACK ROBUSTO
    console.log(`🔧 MODO FALLBACK ATIVADO - Operando com análise técnica`);
    
    return {
      signal,
      direction,
      c1Direction: null,
      volumeFactor: volume.factor,
      confirmation: `Standalone (IA offline): ${session}`,
      risk,
      confidence: baseConfidence * 0.88,
      notes: `Standalone FALLBACK: Wyckoff ${wyckoff.phase}, análise técnica validada`,
      marketData: { price: currentPrice, rsi, macd, atr, wyckoff, volumeProfile },
      rangeHigh: null,
      rangeLow: null,
    };
  }
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

// Scan market for valid trading pairs
async function scanMarketForValidPairs(): Promise<string[]> {
  try {
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    const data = await response.json();

    const perpetualPairs = data.symbols.filter((s: any) => 
      s.symbol.endsWith('USDT') && 
      s.contractType === 'PERPETUAL' &&
      s.status === 'TRADING'
    );

    console.log(`Total USDT perpetual pairs available: ${perpetualPairs.length}`);

    // Get 24h stats for volume filtering
    const statsResponse = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
    const stats = await statsResponse.json();
    const statsMap = new Map(stats.map((s: any) => [s.symbol, s]));

    const validPairs = perpetualPairs
      .filter((pair: any) => {
        const stat: any = statsMap.get(pair.symbol);
        if (!stat) return false;

        const volume24h = parseFloat(stat.quoteVolume);
        const priceChange = Math.abs(parseFloat(stat.priceChangePercent));

        return volume24h >= 50_000_000 && priceChange >= 0.5;
      })
      .map((pair: any) => pair.symbol)
      .slice(0, 15);

    console.log(`Filtered to ${validPairs.length} high-quality pairs with volume >= $50,000,000`);
    
    return validPairs;
  } catch (error) {
    console.error('Error scanning market:', error);
    return ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  }
}

// Fetch candles from Binance
async function fetchCandlesFromBinance(symbol: string, intervals: string[]) {
  const candles: any = {};

  for (const interval of intervals) {
    try {
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
  
    // Verify pitchfork pattern on M5 (só para LONG ou SHORT válidos)
    const pitchfork = detectPitchforkPattern(candles5m, signal as 'LONG' | 'SHORT');
  
    if (!pitchfork.confirmed) {
      return {
        allowed: false,
        reason: `Zona H1 OK, mas aguardando padrão pitchfork M5 (${pitchfork.status})`,
        h1Zones,
        pitchforkConfirmed: false
      };
    }
  
    // Calculate Stop/Target based on H1 + M5
    const { entry, stop, target } = calculateH1M5Levels(
      signal as 'LONG' | 'SHORT',
      currentPrice,
      h1Zones,
      pitchfork.pivotHigh,
      pitchfork.pivotLow,
      candles5m
    );
  
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

// Detect H1 Magic Lines (Support/Resistance)
function detectH1MagicLines(candles1h: any[]): {
  resistance: number;
  support: number;
  midRange: number;
  rangeSize: number;
} {
  const recent = candles1h.slice(-48); // Last 48 H1 candles (2 days)
  
  const highs = recent.map(c => parseFloat(c.high));
  const resistance = Math.max(...highs);
  
  const lows = recent.map(c => parseFloat(c.low));
  const support = Math.min(...lows);
  
  const midRange = (resistance + support) / 2;
  const rangeSize = resistance - support;
  
  console.log(`📏 Linhas Mágicas H1:
    ├─ Resistência: ${resistance.toFixed(2)}
    ├─ Suporte: ${support.toFixed(2)}
    ├─ Mid-Range: ${midRange.toFixed(2)}
    └─ Range Size: ${rangeSize.toFixed(2)}`);
  
  return { resistance, support, midRange, rangeSize };
}

// Classify Price Position relative to H1 zones
function classifyPricePosition(
  price: number,
  zones: { resistance: number; support: number; midRange: number; rangeSize: number }
): 'AT_SUPPORT' | 'AT_RESISTANCE' | 'MID_RANGE' | 'APPROACHING_SUPPORT' | 'APPROACHING_RESISTANCE' {
  
  const tolerance = zones.rangeSize * 0.03; // 3% tolerance
  
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
  if (distanceFromMid < zones.rangeSize * 0.25) {
    return 'MID_RANGE';
  }
  
  // Approaching which zone?
  return price > zones.midRange ? 'APPROACHING_RESISTANCE' : 'APPROACHING_SUPPORT';
}

// Detect Pitchfork Pattern on M5
function detectPitchforkPattern(
  candles5m: any[],
  signal: 'LONG' | 'SHORT'
): {
  confirmed: boolean;
  status: string;
  pivotHigh?: number;
  pivotLow?: number;
} {
  
  const last10 = candles5m.slice(-10);
  
  if (signal === 'LONG') {
    // Count consecutive red candles
    let redCount = 0;
    for (let i = last10.length - 2; i >= 0; i--) {
      const c = last10[i];
      const close = parseFloat(c.close);
      const open = parseFloat(c.open);
      if (close < open) redCount++;
      else break;
    }
    
    // Last candle must be green
    const lastCandle = last10[last10.length - 1];
    const isGreen = parseFloat(lastCandle.close) > parseFloat(lastCandle.open);
    
    if (redCount < 3) {
      return { confirmed: false, status: `Apenas ${redCount} velas vermelhas (precisa 3+)` };
    }
    
    if (!isGreen) {
      return { confirmed: false, status: 'Aguardando primeira vela verde de reversão' };
    }
    
    // Check if breakout occurred above first green candle's high
    const firstGreenHigh = parseFloat(lastCandle.high);
    const currentPrice = parseFloat(lastCandle.close);
    
    if (currentPrice <= firstGreenHigh) {
      return { confirmed: false, status: 'Aguardando breakout da máxima da vela verde' };
    }
    
    // ✅ PITCHFORK CONFIRMED
    const pivotLow = Math.min(...last10.slice(-5).map(c => parseFloat(c.low)));
    return { 
      confirmed: true, 
      status: `Pitchfork LONG confirmado: ${redCount} velas vermelhas → reversão verde → breakout`,
      pivotLow
    };
  }
  
  if (signal === 'SHORT') {
    // Count consecutive green candles
    let greenCount = 0;
    for (let i = last10.length - 2; i >= 0; i--) {
      const c = last10[i];
      const close = parseFloat(c.close);
      const open = parseFloat(c.open);
      if (close > open) greenCount++;
      else break;
    }
    
    const lastCandle = last10[last10.length - 1];
    const isRed = parseFloat(lastCandle.close) < parseFloat(lastCandle.open);
    
    if (greenCount < 3) {
      return { confirmed: false, status: `Apenas ${greenCount} velas verdes (precisa 3+)` };
    }
    
    if (!isRed) {
      return { confirmed: false, status: 'Aguardando primeira vela vermelha de reversão' };
    }
    
    const firstRedLow = parseFloat(lastCandle.low);
    const currentPrice = parseFloat(lastCandle.close);
    
    if (currentPrice >= firstRedLow) {
      return { confirmed: false, status: 'Aguardando breakdown da mínima da vela vermelha' };
    }
    
    const pivotHigh = Math.max(...last10.slice(-5).map(c => parseFloat(c.high)));
    return { 
      confirmed: true, 
      status: `Pitchfork SHORT confirmado: ${greenCount} velas verdes → reversão vermelha → breakdown`,
      pivotHigh
    };
  }
  
  return { confirmed: false, status: 'Signal inválido' };
}

// Calculate H1/M5 Levels (Entry, Stop, Target)
function calculateH1M5Levels(
  signal: 'LONG' | 'SHORT',
  currentPrice: number,
  h1Zones: any,
  pivotHigh: number | undefined,
  pivotLow: number | undefined,
  candles5m: any[]
): { entry: number; stop: number; target: number } {
  
  if (signal === 'LONG') {
    const entry = currentPrice;
    
    // Stop: Below M5 pivot OR below H1 support (whichever is safer)
    const atr = calculateATR(candles5m, 14);
    const stopFromPivot = pivotLow ? pivotLow - (atr * 0.5) : h1Zones.support * 0.998;
    const stopFromH1 = h1Zones.support * 0.998;
    const stop = Math.min(stopFromPivot, stopFromH1);
    
    // Target: H1 mid-range (partial realization) or resistance (final target)
    const target = h1Zones.midRange;
    
    return { entry, stop, target };
  }
  
  if (signal === 'SHORT') {
    const entry = currentPrice;
    const atr = calculateATR(candles5m, 14);
    const stopFromPivot = pivotHigh ? pivotHigh + (atr * 0.5) : h1Zones.resistance * 1.002;
    const stopFromH1 = h1Zones.resistance * 1.002;
    const stop = Math.max(stopFromPivot, stopFromH1);
    const target = h1Zones.midRange;
    
    return { entry, stop, target };
  }
  
  return { entry: currentPrice, stop: currentPrice * 0.98, target: currentPrice * 1.02 };
}

// ============================================
// END OF H1/M5 PROTOCOL MODULE
// ============================================

// Execute trade signal with COMPLETE validation
async function executeTradeSignal(supabase: any, userId: string, asset: string, analysis: any, settings: any, currentSession: string) {
  try {
    // ============================================
    // PHASE 1: VALIDATE TECHNICAL INDICATORS
    // ============================================
    console.log(`\n🔍 INICIANDO VALIDAÇÃO COMPLETA - ${asset}`);
    
    const indicators = analysis.indicators || {};
    const wyckoff = analysis.wyckoff || {};
    const { signal, risk, confidence } = analysis;
    
    // Track fallback mode
    let fallbackMode = false;
    let fallbackReason = '';

    // Mandatory indicator checklist
    const validations = {
      rsi: indicators.rsi && indicators.rsi >= 30 && indicators.rsi <= 70,
      macd: indicators.macd !== undefined,
      volume: indicators.volume?.factor && indicators.volume.factor > 0.5,
      atr: indicators.atr && indicators.atr >= 0.005 && indicators.atr <= 0.015,
      wyckoff: wyckoff.phase && wyckoff.phase !== 'NEUTRAL'
    };

    // ============================================
    // PHASE 2: CONSULT AI AGENTS
    // ============================================
    let agentScore = 0;
    let agentFeedback: any = null;
    let agentExecution: any = null;

    try {
      // Agent 1: Analytical Feedback
      console.log(`├─ Consultando Agente Feedback Analítico...`);
      const feedbackResponse = await supabase.functions.invoke('agente-feedback-analitico', {
        body: {
          asset,
          session: currentSession,
          phase: analysis.phase || 'STANDALONE',
          signal,
          confidence,
          indicators,
          wyckoff,
          volume: indicators.volume
        }
      });
      
      // Check for AI failure (402 = no credits, 500 = error)
      if (feedbackResponse.error) {
        const statusCode = feedbackResponse.error.status || feedbackResponse.error.context?.status;
        if (statusCode === 402) {
          fallbackMode = true;
          fallbackReason = '❌ Sem créditos de IA';
        } else if (statusCode === 500 || statusCode >= 400) {
          fallbackMode = true;
          fallbackReason = '⚠️ Agentes offline';
        }
      } else {
        agentFeedback = feedbackResponse.data;
        const feedbackApproved = feedbackResponse.data?.qualityScore >= 75;
        console.log(`│  └─ Feedback: Score ${feedbackResponse.data?.qualityScore}/100 ${feedbackApproved ? '✅' : '❌'}`);
        if (feedbackApproved) agentScore += 13;
      }

      // Agent 2: Confluence Execution (only if feedback succeeded)
      if (!fallbackMode) {
        console.log(`├─ Consultando Agente Execução Confluência...`);
        const executionResponse = await supabase.functions.invoke('agente-execucao-confluencia', {
          body: {
            asset,
            direction: signal,
            entry_price: risk.entry,
            stop_loss: risk.stop,
            take_profit: risk.target,
            rr_ratio: risk.rr_ratio,
            indicators,
            wyckoff,
            volume: indicators.volume
          }
        });
        
        if (executionResponse.error) {
          const statusCode = executionResponse.error.status || executionResponse.error.context?.status;
          if (statusCode === 402 || statusCode >= 400) {
            fallbackMode = true;
            fallbackReason = fallbackReason || '⚠️ Agentes offline';
          }
        } else {
          agentExecution = executionResponse.data;
          const executionApproved = executionResponse.data?.decision === 'APROVAR';
          console.log(`│  └─ Execução: ${executionResponse.data?.decision} (Score: ${executionResponse.data?.confluenceScore}) ${executionApproved ? '✅' : '❌'}`);
          if (executionApproved) agentScore += 13;
        }
      }

      // Agent 3: Risk Management (placeholder)
      if (!fallbackMode) {
        console.log(`│  └─ Gestão Risco: Será avaliado após fechamento ⏳`);
        agentScore += 14;
      }

    } catch (agentError: any) {
      console.error(`❌ Erro ao consultar agentes:`, agentError);
      fallbackMode = true;
      fallbackReason = '⚠️ Erro na comunicação com agentes';
    }

    // ============================================
    // FALLBACK MODE: AUTONOMOUS TECHNICAL TRADING
    // ============================================
    let technicalScore = 0;
    let volumeScore = 0;
    let rrScore = 0;
    let totalScore = 0;
    let minimumRequired = 75;

    if (fallbackMode) {
      console.log(`\n🔧 ========================================`);
      console.log(`   MODO FALLBACK ATIVADO - IA OFFLINE`);
      console.log(`   Razão: ${fallbackReason}`);
      console.log(`   Operando com: Análise Técnica Pura`);
      console.log(`   Sistema de Pontuação: Técnico (100pts)`);
      console.log(`   Threshold: 70/100`);
      console.log(`========================================\n`);
      
      minimumRequired = 70;

      // TECHNICAL SCORE: 50 points max
      let techPoints = 0;
      
      // RSI Analysis - 15 points
      if (indicators.rsi) {
        if (signal === 'LONG' && indicators.rsi >= 30 && indicators.rsi <= 50) {
          techPoints += 15;
          console.log(`│  ├─ RSI: ${indicators.rsi.toFixed(2)} (oversold recovery) ✅ +15`);
        } else if (signal === 'SHORT' && indicators.rsi >= 50 && indicators.rsi <= 70) {
          techPoints += 15;
          console.log(`│  ├─ RSI: ${indicators.rsi.toFixed(2)} (overbought correction) ✅ +15`);
        } else if (indicators.rsi >= 30 && indicators.rsi <= 70) {
          techPoints += 8;
          console.log(`│  ├─ RSI: ${indicators.rsi.toFixed(2)} (neutral zone) ⚠️ +8`);
        } else {
          console.log(`│  ├─ RSI: ${indicators.rsi.toFixed(2)} (extreme) ❌ +0`);
        }
      }

      // MACD Analysis - 15 points
      if (indicators.macd !== undefined) {
        const macdAligned = (signal === 'LONG' && indicators.macd > 0) || (signal === 'SHORT' && indicators.macd < 0);
        if (macdAligned) {
          techPoints += 15;
          console.log(`│  ├─ MACD: ${indicators.macd.toFixed(4)} (aligned with ${signal}) ✅ +15`);
        } else {
          techPoints += 5;
          console.log(`│  ├─ MACD: ${indicators.macd.toFixed(4)} (divergent) ⚠️ +5`);
        }
      }

      // Trend Strength - 10 points
      const trendStrength = analysis.trend?.strength || 0;
      if (trendStrength >= 0.7) {
        techPoints += 10;
        console.log(`│  ├─ Trend Strength: ${trendStrength.toFixed(2)} (strong) ✅ +10`);
      } else if (trendStrength >= 0.5) {
        techPoints += 5;
        console.log(`│  ├─ Trend Strength: ${trendStrength.toFixed(2)} (moderate) ⚠️ +5`);
      } else {
        console.log(`│  ├─ Trend Strength: ${trendStrength.toFixed(2)} (weak) ❌ +0`);
      }

      // Volume Factor - 10 points
      if (indicators.volume?.factor) {
        if (indicators.volume.factor >= 0.8) {
          techPoints += 10;
          console.log(`│  └─ Volume: ${indicators.volume.factor.toFixed(2)}x (strong) ✅ +10`);
        } else if (indicators.volume.factor >= 0.5) {
          techPoints += 5;
          console.log(`│  └─ Volume: ${indicators.volume.factor.toFixed(2)}x (moderate) ⚠️ +5`);
        } else {
          console.log(`│  └─ Volume: ${indicators.volume.factor.toFixed(2)}x (weak) ❌ +0`);
        }
      }

      technicalScore = techPoints;
      console.log(`├─ Score Técnico: ${technicalScore}/50\n`);

      // VOLUME & MOMENTUM SCORE: 30 points max
      let volPoints = 0;
      
      if (indicators.volume?.factor && indicators.volume.factor >= 0.6) {
        volPoints += 20;
        console.log(`│  ├─ Volume confirmado: ${indicators.volume.factor.toFixed(2)}x ✅ +20`);
      }
      
      // Wyckoff confirmation
      if (wyckoff.phase && wyckoff.phase !== 'NEUTRAL') {
        volPoints += 10;
        console.log(`│  └─ Wyckoff: ${wyckoff.phase} ✅ +10`);
      }
      
      volumeScore = volPoints;
      console.log(`├─ Score Volume & Momentum: ${volumeScore}/30\n`);

    } else {
      // NORMAL MODE: Original scoring
      technicalScore = Object.values(validations).filter(Boolean).length * 6;
      
      console.log(`├─ Indicadores Técnicos (Score: ${technicalScore}/30):`);
      console.log(`│  ├─ RSI: ${indicators.rsi?.toFixed(2)} ${validations.rsi ? '✅' : '❌'}`);
      console.log(`│  ├─ MACD: ${indicators.macd?.toFixed(4)} ${validations.macd ? '✅' : '❌'}`);
      console.log(`│  ├─ Volume Factor: ${indicators.volume?.factor?.toFixed(2)}x ${validations.volume ? '✅' : '❌'}`);
      console.log(`│  ├─ ATR: ${indicators.atr?.toFixed(4)} ${validations.atr ? '✅' : '❌'}`);
      console.log(`│  └─ Wyckoff Phase: ${wyckoff.phase} ${validations.wyckoff ? '✅' : '❌'}`);

      console.log(`├─ Score Total Agentes: ${agentScore}/40`);
      
      volumeScore = validations.volume ? 20 : 0;
    }

    // ============================================
    // PHASE 3: VOLUME & MOMENTUM (for normal mode)
    // ============================================
    if (!fallbackMode) {
      console.log(`├─ Volume & Momentum: ${volumeScore}/20 ${validations.volume ? '✅' : '❌'}`);
    }

    // ============================================
    // PHASE 4: RISK/REWARD VALIDATION
    // ============================================
    if (!risk || !risk.entry || !risk.stop || !risk.target) {
      console.log(`❌ Invalid risk parameters for ${asset}`);
      return false;
    }

    const rrValid = risk.rr_ratio >= 1.5;
    
    if (fallbackMode) {
      // RISK/REWARD SCORE: 20 points max in fallback
      if (risk.rr_ratio >= 2.5) {
        rrScore = 20;
        console.log(`├─ Risk/Reward: ${risk.rr_ratio.toFixed(2)} (excellent) ✅ +20/20`);
      } else if (risk.rr_ratio >= 2.0) {
        rrScore = 15;
        console.log(`├─ Risk/Reward: ${risk.rr_ratio.toFixed(2)} (good) ✅ +15/20`);
      } else if (risk.rr_ratio >= 1.5) {
        rrScore = 10;
        console.log(`├─ Risk/Reward: ${risk.rr_ratio.toFixed(2)} (acceptable) ⚠️ +10/20`);
      } else {
        rrScore = 0;
        console.log(`├─ Risk/Reward: ${risk.rr_ratio.toFixed(2)} (too low) ❌ +0/20`);
      }
    } else {
      // Normal mode: 10 points max
      rrScore = rrValid ? 10 : 0;
      console.log(`├─ Risk/Reward: ${risk.rr_ratio?.toFixed(2)} ${rrScore}/10 ${rrValid ? '✅' : '❌'}`);
    }

    // ============================================
    // CONFLUENCE CHECK (Fallback only)
    // ============================================
    if (fallbackMode) {
      let confluencePoints = 0;
      
      // RSI confirms
      if ((signal === 'LONG' && indicators.rsi && indicators.rsi < 50) ||
          (signal === 'SHORT' && indicators.rsi && indicators.rsi > 50)) {
        confluencePoints++;
      }
      
      // MACD confirms
      if ((signal === 'LONG' && indicators.macd && indicators.macd > 0) ||
          (signal === 'SHORT' && indicators.macd && indicators.macd < 0)) {
        confluencePoints++;
      }
      
      // Volume confirms
      if (indicators.volume?.factor && indicators.volume.factor >= 0.6) {
        confluencePoints++;
      }
      
      // Wyckoff confirms
      if (wyckoff.phase && wyckoff.phase !== 'NEUTRAL') {
        confluencePoints++;
      }
      
      // Trend confirms
      const trendStrength = analysis.trend?.strength || 0;
      if (trendStrength >= 0.5) {
        confluencePoints++;
      }
      
      console.log(`├─ Confluência: ${confluencePoints}/5 indicadores concordando ${confluencePoints >= 3 ? '✅' : '❌'}`);
      
      if (confluencePoints < 3) {
        console.log(`❌ Confluência insuficiente - precisa de pelo menos 3/5 indicadores`);
        return false;
      }
    }

    // ============================================
    // FINAL QUALITY SCORE
    // ============================================
    if (fallbackMode) {
      totalScore = technicalScore + volumeScore + rrScore;
    } else {
      totalScore = technicalScore + agentScore + volumeScore + rrScore;
    }
    
    console.log(`└─ SCORE FINAL: ${totalScore}/100 (mínimo: ${minimumRequired})\n`);

    if (totalScore < minimumRequired) {
      console.log(`❌ Setup rejeitado - Score ${totalScore} < ${minimumRequired} (mínimo necessário)`);
      
      await supabase.from('agent_logs').insert({
        user_id: userId,
        agent_name: fallbackMode ? 'FALLBACK_VALIDATION' : 'SYSTEM_VALIDATION',
        asset,
        status: 'rejected',
        data: {
          reason: 'Score insuficiente',
          totalScore,
          minimumRequired,
          fallbackMode,
          fallbackReason,
          breakdown: { technicalScore, agentScore, volumeScore, rrScore },
          validations,
          agents: { agentFeedback, agentExecution }
        }
      });
      
      return false;
    }

    console.log(`✅ Setup APROVADO - Procedendo com execução ${fallbackMode ? '(MODO FALLBACK)' : ''}\n`);

    // Validate signal confidence (more lenient in fallback)
    const minConfidence = fallbackMode ? 0.50 : 0.60;
    if (confidence < minConfidence) {
      console.log(`❌ Confidence too low: ${confidence.toFixed(2)} (min: ${minConfidence.toFixed(2)})`);
      return false;
    }

    // Calculate position size
    const balance = settings.balance;
    const riskPerTrade = settings.risk_per_trade;
    const riskAmount = balance * riskPerTrade;

    const entryPrice = risk.entry;
    const stopLoss = risk.stop;
    const takeProfit = risk.target;
    const riskPerUnit = Math.abs(entryPrice - stopLoss);

    if (riskPerUnit === 0) {
      console.log(`❌ Invalid risk per unit for ${asset}`);
      return false;
    }

    // Check if user has sufficient balance
    if (balance < riskAmount) {
      console.log(`❌ Insufficient balance: $${balance} < $${riskAmount}`);
      return false;
    }

    const quantity = riskAmount / riskPerUnit;
    const projectedProfit = Math.abs(takeProfit - entryPrice) * quantity;

    console.log(`
    💰 EXECUTING TRADE:
    - Asset: ${asset}
    - Direction: ${signal}
    - Entry: ${entryPrice}
    - Stop Loss: ${stopLoss}
    - Take Profit: ${takeProfit}
    - R:R Ratio: ${risk.rr_ratio.toFixed(2)}
    - Quantity: ${quantity.toFixed(4)}
    - Risk: $${riskAmount.toFixed(2)}
    - Projected Profit: $${projectedProfit.toFixed(2)}
    - Confidence: ${(confidence * 100).toFixed(1)}%
    `);

    // 🔥 BINANCE INTEGRATION: Execute real order if not in paper mode
    if (!settings.paper_mode && settings.api_key && settings.api_secret) {
      console.log(`📡 Calling binance-order for REAL trade: ${asset} ${signal}`);
      
      try {
        const { data: orderData, error: orderError } = await supabase.functions.invoke('binance-order', {
          body: {
            user_id: userId,
            asset,
            direction: signal,
            side: signal === 'LONG' ? 'BUY' : 'SELL',
            quantity: quantity.toFixed(4),
            price: entryPrice,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            riskReward: risk.rr_ratio,
            agents: {
              confidence,
              agentFeedback,
              agentExecution,
              totalScore
            },
            session: currentSession,
          },
        });

        if (orderError) {
          console.error(`❌ Binance order error:`, orderError);
          return false;
        }

        console.log(`✅ Binance order executed:`, orderData);
        
        // ✅ Validar status da ordem real
        if (orderData?.mode === 'real') {
          const binanceOrder = orderData.binanceOrder;
          
          if (!binanceOrder || (binanceOrder.status !== 'FILLED' && binanceOrder.status !== 'NEW')) {
            console.error(`⚠️ Ordem não executada completamente. Status: ${binanceOrder?.status || 'UNKNOWN'}`);
            return false;
          }
          
          console.log(`📋 Binance Order ID: ${binanceOrder.orderId}`);
          console.log(`📊 Status: ${binanceOrder.status}`);
          console.log(`💰 Executado: ${binanceOrder.executedQty || 'N/A'}/${binanceOrder.origQty || 'N/A'}`);
          console.log(`💵 Preço médio: ${binanceOrder.avgPrice || binanceOrder.price || 'N/A'}`);
        }
      } catch (binanceError) {
        console.error(`❌ Binance execution failed:`, binanceError);
        return false;
      }
    } else {
      console.log(`📄 Paper mode: Simulating trade execution`);
    }

    // Insert position
    const { error: insertError } = await supabase
      .from('active_positions')
      .insert({
        user_id: userId,
        asset,
        direction: mapDirection(signal),
        session: mapSession(currentSession),
        entry_price: entryPrice,
        current_price: entryPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_reward: risk.rr_ratio,
        projected_profit: projectedProfit,
        current_pnl: 0,
        opened_at: new Date().toISOString(),
        agents: {
          feedback: agentFeedback,
          execution: agentExecution,
          validationScore: totalScore
        },
      });

    if (insertError) {
      console.error(`❌ Error inserting position:`, insertError);
      return false;
    }

    // Log agent actions
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: fallbackMode ? 'Fallback Trade Executor' : 'Trade Executor',
      asset,
      status: 'active',
      data: {
        action: 'TRADE_EXECUTED',
        mode: fallbackMode ? 'FALLBACK' : 'AI_ASSISTED',
        fallbackReason: fallbackMode ? fallbackReason : null,
        signal,
        entry: entryPrice,
        stop: stopLoss,
        target: takeProfit,
        rr_ratio: risk.rr_ratio,
        confidence,
        session: currentSession,
        totalScore,
        minimumRequired,
        breakdown: { technicalScore, agentScore, volumeScore, rrScore },
        agents: { agentFeedback, agentExecution }
      },
    });

    console.log(`✅ Position opened for ${asset} - ${signal}`);
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

      // Calculate P&L
      const priceDiff = direction === 'BUY' 
        ? currentPrice - entryPrice 
        : entryPrice - currentPrice;
      
      const riskAmount = settings.balance * settings.risk_per_trade;
      const riskPerUnit = Math.abs(entryPrice - stopLoss);
      const quantity = riskAmount / riskPerUnit;
      const currentPnL = priceDiff * quantity;

      // Update position
      await supabase
        .from('active_positions')
        .update({
          current_price: currentPrice,
          current_pnl: currentPnL,
        })
        .eq('id', position.id);

      // ⏰ SCALPING: Check time-based exit FIRST
      const now = new Date();
      const openedAt = new Date(position.opened_at);
      const minutesInPosition = (now.getTime() - openedAt.getTime()) / 60000;

      let closePosition = false;
      let result = '';

      // REGRA 1: Após 15 minutos, fechar SE tiver qualquer lucro
      if (minutesInPosition >= 15) {
        if (currentPnL > 0) {
          closePosition = true;
          result = 'WIN';
          const profitPercent = (Math.abs(currentPnL) / (settings.balance * settings.risk_per_trade)) * 100;
          console.log(`⏰ 15min exit with profit - ${symbol}: $${currentPnL.toFixed(2)} (${profitPercent.toFixed(2)}%)`);
        }
        // Se ainda no prejuízo, dar +5min de chance
        else if (minutesInPosition >= 20) {
          closePosition = true;
          result = currentPnL > 0 ? 'WIN' : 'LOSS';
          console.log(`⏰ 20min force exit - ${symbol}: $${currentPnL.toFixed(2)}`);
        }
      }

      // REGRA 2: Fechar rápido se lucro >= 0.5% (mesmo antes de 15min)
      if (!closePosition) {
        const profitPercent = (Math.abs(currentPnL) / (settings.balance * settings.risk_per_trade)) * 100;
        if (currentPnL > 0 && profitPercent >= 0.5 && minutesInPosition >= 5) {
          closePosition = true;
          result = 'WIN';
          console.log(`💰 Quick profit (${profitPercent.toFixed(2)}%) - ${symbol}: $${currentPnL.toFixed(2)}`);
        }
      }

      // REGRA 3: Stop Loss de emergência -2% (proteger capital)
      if (!closePosition) {
        const lossPercent = (Math.abs(currentPnL) / (settings.balance * settings.risk_per_trade)) * 100;
        if (currentPnL < 0 && lossPercent >= 2.0) {
          closePosition = true;
          result = 'LOSS';
          console.log(`🛑 Emergency stop -${lossPercent.toFixed(2)}% - ${symbol}: $${currentPnL.toFixed(2)}`);
        }
      }

      // Check normal TP/SL if not already closing
      if (!closePosition && direction === 'BUY') {
        if (currentPrice >= takeProfit) {
          closePosition = true;
          result = 'WIN';
          console.log(`🎯 Take Profit hit for ${symbol} - LONG at ${currentPrice}`);
        } else if (currentPrice <= stopLoss) {
          closePosition = true;
          result = 'LOSS';
          console.log(`❌ Stop Loss hit for ${symbol} - LONG at ${currentPrice}`);
        }
      } else if (!closePosition) {
        if (currentPrice <= takeProfit) {
          closePosition = true;
          result = 'WIN';
          console.log(`🎯 Take Profit hit for ${symbol} - SHORT at ${currentPrice}`);
        } else if (currentPrice >= stopLoss) {
          closePosition = true;
          result = 'LOSS';
          console.log(`❌ Stop Loss hit for ${symbol} - SHORT at ${currentPrice}`);
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
