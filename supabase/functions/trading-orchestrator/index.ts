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

// Session time ranges in UTC
const SESSIONS = {
  OCEANIA: { start: 0, end: 3, name: 'Oceania' },
  ASIA: { start: 3, end: 8, name: 'Asia' },
  LONDON: { start: 8, end: 12, name: 'London' },
  NEW_YORK: { start: 12, end: 17, name: 'NewYork' },
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

// ✅ NOVA FUNÇÃO: Processar ciclo de trading para um usuário específico
async function processUserTradingCycle(supabase: any, settings: any, currentSession: string, cyclePhase: string) {
  const userId = settings.user_id;

  // ✅ Check daily goals POR USUÁRIO
  const { data: dailyGoal } = await supabase
    .from('daily_goals')
    .select('*')
    .eq('user_id', userId)
    .eq('date', new Date().toISOString().split('T')[0])
    .single();

  // ✅ Verificar meta diária: 4% de P&L ou máximo de perdas
  const currentPnlPercent = dailyGoal ? (dailyGoal.total_pnl / settings.balance) * 100 : 0;
  const targetPnlPercent = dailyGoal?.target_pnl_percent || 4.0;
  
  if (dailyGoal && currentPnlPercent >= targetPnlPercent) {
    console.log(`✅ META DIÁRIA DE ${targetPnlPercent}% ATINGIDA para user ${userId}!`);
    console.log(`📊 P&L: $${dailyGoal.total_pnl} (${currentPnlPercent.toFixed(2)}%)`);
    console.log(`📈 Performance: ${dailyGoal.wins} wins | ${dailyGoal.losses} losses | ${dailyGoal.total_operations} ops`);
    
    await supabase.from('user_settings').update({ 
      bot_status: 'stopped' 
    }).eq('user_id', userId);
    
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Daily Goal Manager',
      asset: 'SYSTEM',
      status: 'success',
      data: {
        message: 'Meta diária de P&L atingida',
        pnl: dailyGoal.total_pnl,
        pnl_percent: currentPnlPercent,
        target_percent: targetPnlPercent,
        total_operations: dailyGoal.total_operations,
        wins: dailyGoal.wins,
        losses: dailyGoal.losses,
        win_rate: ((dailyGoal.wins / dailyGoal.total_operations) * 100).toFixed(1),
      }
    });
    
    return { 
      user_id: userId,
      message: 'Meta diária atingida - bot parado',
      status: 'stopped',
      stats: {
        operations: dailyGoal.total_operations,
        wins: dailyGoal.wins,
        losses: dailyGoal.losses,
        pnl: dailyGoal.total_pnl,
      }
    };
  }

  // ✅ Verificar se atingiu limite de perdas
  if (dailyGoal && dailyGoal.losses >= dailyGoal.max_losses) {
    console.log(`Max losses reached for user ${userId} - stopping bot`);
    await supabase.from('user_settings').update({ bot_status: 'stopped' }).eq('user_id', userId);
    return { 
      user_id: userId,
      message: 'Max losses reached, bot stopped',
      status: 'stopped' 
    };
  }

  // ✅ Get active positions POR USUÁRIO
  const { data: activePositions } = await supabase
    .from('active_positions')
    .select('*')
    .eq('user_id', userId);

  // Check max positions
  if (activePositions && activePositions.length >= settings.max_positions) {
    console.log(`Max positions reached for user ${userId}`);
    return {
      user_id: userId,
      message: 'Max positions reached',
      activePositions: activePositions.length
    };
  }

  // Scan market for valid trading pairs
  console.log('Scanning market for valid trading pairs...');
  const allAssets = await scanMarketForValidPairs();
  
  if (allAssets.length === 0) {
    console.log('No valid assets found in market scan');
    return {
      user_id: userId,
      message: 'No valid trading pairs found'
    };
  }

  console.log(`Found ${allAssets.length} valid trading pairs: ${allAssets.join(', ')}`);
  
  const sessionAnalysis: any[] = [];

  // ✅ Get last session data POR USUÁRIO for C1 direction tracking
  const { data: lastSessionData } = await supabase
    .from('session_history')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

    for (const asset of allAssets) {
      // Skip if already have position
      if (activePositions?.some((p: any) => p.asset === asset)) {
        console.log(`Skipping ${asset} - already have position`);
        continue;
      }

      console.log(`Analyzing ${asset} - Session: ${currentSession}`);

      // Fetch market data
      const candles = await fetchCandlesFromBinance(asset);
      
      // Analyze based on current phase
      const analysis = await analyzeCyclePhase({
        candles,
        asset,
        settings,
        session: currentSession,
        phase: cyclePhase,
        lastC1Direction: lastSessionData?.c1_direction,
        londonRange: lastSessionData ? { high: lastSessionData.range_high, low: lastSessionData.range_low } : null,
      });

      // ✅ Store session analysis COM user_id
      await supabase.from('session_history').insert({
        user_id: userId,
        timestamp: new Date().toISOString(),
        pair: asset,
        session: currentSession,
        cycle_phase: cyclePhase,
        direction: analysis.direction,
        volume_factor: analysis.volumeFactor,
        confirmation: analysis.confirmation,
        risk: analysis.risk,
        confidence_score: analysis.confidence,
        notes: analysis.notes,
        market_data: analysis.marketData,
        c1_direction: analysis.c1Direction,
        range_high: analysis.rangeHigh,
        range_low: analysis.rangeLow,
        signal: analysis.signal,
      });

      // ✅ Log agent activity COM user_id
      await supabase.from('agent_logs').insert({
        user_id: userId,
        agent_name: 'Cycle Orchestrator',
        asset: asset,
        status: analysis.signal === 'STAY_OUT' ? 'waiting' : 'active',
        data: {
          session: currentSession,
          phase: cyclePhase,
          signal: analysis.signal,
          confidence: analysis.confidence,
          notes: analysis.notes,
        }
      });

      // Send analysis to AI Agent - Agente de Feedback Analítico
      if (analysis.signal !== 'STAY_OUT') {
        try {
          console.log(`🤖 Calling Agente Feedback Analítico for ${asset}...`);
          const agentResponse = await fetch(AGENTE_FEEDBACK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              asset,
              session: currentSession,
              phase: cyclePhase,
              signal: analysis.signal,
              confidence: analysis.confidence,
              direction: analysis.direction,
              risk: analysis.risk,
              marketData: analysis.marketData,
              timestamp: new Date().toISOString(),
            }),
          });

          if (agentResponse.ok) {
            const agentData = await agentResponse.json();
            console.log(`✅ Agent Feedback: Quality Score ${agentData.qualityScore}/100 | Recommendation: ${agentData.recommendation}`);
            
            // Update confidence based on AI analysis
            if (agentData.adjustedConfidence) {
              analysis.confidence = agentData.adjustedConfidence;
              console.log(`📊 Confidence adjusted: ${(agentData.adjustedConfidence * 100).toFixed(1)}%`);
            }
          }
        } catch (agentError) {
          console.error('❌ Agente Feedback Analítico error:', agentError);
          // Don't fail the main flow if agent is down
        }
      }

      // ✅ Verificar se NÃO estamos nas últimas 2 velas ou primeiras velas da sessão
      const isInvalidTradingTime = isNearSessionTransition(currentSession);
      
      if (isInvalidTradingTime) {
        console.log(`⏸️ Aguardando transição de sessão - não operando nas primeiras/últimas velas`);
        await supabase.from('agent_logs').insert({
          user_id: userId,
          agent_name: 'Session Filter',
          asset: asset,
          status: 'waiting',
          data: {
            reason: 'Aguardando fim de transição de sessão',
            session: currentSession,
          }
        });
        continue; // Pular para próximo asset
      }
      
      // ✅ Execute trade em QUALQUER sessão com R:R flexível (1.15-1.6)
      // CRITICAL: Aceitar R:R de 1.15 até 1.6 para maximizar oportunidades
      const rrRatio = analysis.risk?.rr_ratio || 0;
      
      if (analysis.signal !== 'STAY_OUT' && analysis.confidence >= 0.8 && rrRatio >= 1.15 && rrRatio <= 1.6) {
        console.log(`✅ EXECUTANDO TRADE: ${asset} | Conf: ${(analysis.confidence * 100).toFixed(1)}% | R:R: ${rrRatio.toFixed(2)} | Session: ${currentSession}`);
        await executeTradeSignal(supabase, asset, analysis, settings, currentSession, userId);
      } else if (analysis.signal !== 'STAY_OUT') {
        const reason = analysis.confidence < 0.8 
          ? `Confidence baixa (${(analysis.confidence * 100).toFixed(1)}%)`
          : `R:R fora do range (${rrRatio.toFixed(2)}, aceito: 1.15-1.6)`;
        
        console.log(`⚠️ Signal detectado mas não executado: ${reason} - skipping ${asset}`);
        await supabase.from('agent_logs').insert({
          user_id: userId,
          agent_name: 'Trade Filter',
          asset: asset,
          status: 'skipped',
          data: {
            reason,
            confidence: analysis.confidence,
            risk_reward: rrRatio,
            signal: analysis.signal,
          }
        });
      }

      sessionAnalysis.push({ asset, analysis });
    }

  // Monitor active positions
  if (activePositions && activePositions.length > 0) {
    await monitorActivePositions(supabase, activePositions, userId);
  }

  return {
    user_id: userId,
    success: true,
    session: currentSession,
    phase: cyclePhase,
    analysis: sessionAnalysis,
    activePositions: activePositions?.length || 0,
  };
}

// Check if we are near session transition (first or last 2 candles of 15min)
function isNearSessionTransition(currentSession: string): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  
  // Get current session times
  const session = Object.values(SESSIONS).find(s => s.name === currentSession);
  if (!session) return false;
  
  // Check if we're in the last 30 minutes (2 velas de 15min)
  const isLastCandles = (utcHour === session.end - 1 && utcMinute >= 30) || utcHour >= session.end;
  
  // Check if we're in the first 30 minutes (2 velas de 15min)
  const isFirstCandles = utcHour === session.start && utcMinute < 30;
  
  return isLastCandles || isFirstCandles;
}

// Detect current trading session based on UTC time
function detectCurrentSession(): string {
  const now = new Date();
  const utcHour = now.getUTCHours();

  for (const [key, session] of Object.entries(SESSIONS)) {
    if (utcHour >= session.start && utcHour < session.end) {
      return session.name;
    }
  }
  return 'Oceania'; // Default
}

// Determine cycle phase based on session
function getCyclePhase(session: string): string {
  if (session === 'Oceania' || session === 'Asia') return 'Projection';
  if (session === 'London') return 'Consolidation';
  if (session === 'NewYork') return 'Execution';
  return 'Projection';
}

// Main cycle analysis function
async function analyzeCyclePhase(params: any) {
  const { candles, asset, session, phase, lastC1Direction, londonRange } = params;

  const candles5m = candles['5m'];
  const candles15m = candles['15m'];
  const candles1h = candles['1h'];

  if (!candles5m || !candles15m || !candles1h) {
    return createEmptyAnalysis('Insufficient candle data');
  }

  const currentPrice = parseFloat(candles5m[candles5m.length - 1].close);

  // Calculate indicators
  const indicators = calculateIndicators(candles5m, candles15m, candles1h);

  // Phase-specific analysis
  if (phase === 'Projection') {
    return analyzeProjectionPhase(candles5m, candles15m, indicators, currentPrice, asset, session);
  } else if (phase === 'Consolidation') {
    return analyzeConsolidationPhase(candles5m, candles15m, indicators, currentPrice, asset, lastC1Direction);
  } else if (phase === 'Execution') {
    return analyzeExecutionPhase(candles5m, candles15m, indicators, currentPrice, asset, lastC1Direction, londonRange);
  }

  return createEmptyAnalysis('Unknown phase');
}

// PHASE 1: PROJECTION - Oceania and Asia
function analyzeProjectionPhase(candles5m: any[], candles15m: any[], indicators: any, currentPrice: number, asset: string, session: string) {
  const { rsi, vwma, atr, volume } = indicators;

  // Check if this is the beginning of Oceania (first 4 candles M15)
  const isOceaniaStart = session === 'Oceania' && candles15m.length >= 4;
  
  let direction = 'NEUTRAL';
  let c1Direction = null;
  let confidence = 0;

  // Detect C1 direction based on first 4 M15 candles of Oceania
  if (isOceaniaStart) {
    const first4Candles = candles15m.slice(-4);
    const high = Math.max(...first4Candles.map((c: any) => c.high));
    const low = Math.min(...first4Candles.map((c: any) => c.low));
    const close = first4Candles[first4Candles.length - 1].close;
    
    if (close > (high + low) / 2) {
      c1Direction = 'LONG';
      direction = 'LONG';
    } else {
      c1Direction = 'SHORT';
      direction = 'SHORT';
    }

    confidence = volume.factor > 1.2 ? 0.8 : 0.6;
  }

  // Asia confirms Oceania direction
  if (session === 'Asia' && indicators.trend === 'UP') {
    direction = 'LONG';
    confidence = 0.75;
  } else if (session === 'Asia' && indicators.trend === 'DOWN') {
    direction = 'SHORT';
    confidence = 0.75;
  }

  return {
    signal: 'STAY_OUT', // Don't trade in projection phase
    direction,
    c1Direction,
    volumeFactor: volume.factor,
    confirmation: `${session} - Projection phase | Trend: ${indicators.trend} | RSI: ${rsi.toFixed(2)}`,
    risk: null,
    confidence,
    notes: `${session} mapping market direction. Volume factor: ${volume.factor.toFixed(2)}. C1 Direction: ${c1Direction || 'N/A'}`,
    marketData: { price: currentPrice, vwma, rsi, atr },
    rangeHigh: null,
    rangeLow: null,
  };
}

// PHASE 2: CONSOLIDATION - London
function analyzeConsolidationPhase(candles5m: any[], candles15m: any[], indicators: any, currentPrice: number, asset: string, lastC1Direction: string | null) {
  const { rsi, vwma, atr, volume, slope } = indicators;

  // Calculate London range (first 2 hours = 8 candles M15)
  const londonCandles = candles15m.slice(-8);
  const rangeHigh = Math.max(...londonCandles.map((c: any) => c.high));
  const rangeLow = Math.min(...londonCandles.map((c: any) => c.low));

  // Detect consolidation characteristics
  const isConsolidating = Math.abs(slope) < 0.1 && rsi > 45 && rsi < 55;
  const hasHighVolume = volume.factor > 1.3;

  // Monitor for stop hunts and liquidity zones
  const notes = `London consolidation phase. Range: ${rangeLow.toFixed(2)} - ${rangeHigh.toFixed(2)}. ${isConsolidating ? 'Market in range' : 'Breaking structure'}. Volume elevated: ${hasHighVolume}`;

  return {
    signal: 'STAY_OUT', // Don't trade during consolidation
    direction: 'NEUTRAL',
    c1Direction: lastC1Direction,
    volumeFactor: volume.factor,
    confirmation: 'London - Consolidation phase | Monitoring range',
    risk: null,
    confidence: 0.5,
    notes,
    marketData: { price: currentPrice, vwma, rsi, atr, slope },
    rangeHigh,
    rangeLow,
  };
}

// PHASE 3: EXECUTION - New York
function analyzeExecutionPhase(candles5m: any[], candles15m: any[], indicators: any, currentPrice: number, asset: string, lastC1Direction: string | null, londonRange: any) {
  const { rsi, vwma, ema, macd, atr, volume } = indicators;

  if (!londonRange) {
    return createEmptyAnalysis('No London range data available');
  }

  const { high: rangeHigh, low: rangeLow } = londonRange;
  
  // Check for range breakout
  const breakoutUp = currentPrice > rangeHigh;
  const breakoutDown = currentPrice < rangeLow;
  
  // Volume confirmation (must be 1.5x average)
  const volumeConfirmed = volume.factor > 1.5;
  
  // Technical alignment
  const bullishAlignment = vwma > ema && macd > 0 && rsi < 70;
  const bearishAlignment = vwma < ema && macd < 0 && rsi > 30;

  let signal = 'STAY_OUT';
  let direction = 'NEUTRAL';
  let confidence = 0;
  let risk = null;
  let confirmation = '';

  // LONG setup
  if (breakoutUp && volumeConfirmed && bullishAlignment) {
    signal = 'LONG';
    direction = 'LONG';
    
    const stopLoss = currentPrice - (atr * 1.0);
    const rangeAmplitude = rangeHigh - rangeLow;
    const takeProfit = currentPrice + (rangeAmplitude * 2); // Measured move
    const rrRatio = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss);

    // ✅ FASE 2: Validar range de R:R (1.3 a 1.6)
    if (rrRatio < 1.3 || rrRatio > 1.6) {
      console.log(`❌ R:R fora do range aceitável: ${rrRatio.toFixed(2)} (esperado: 1.3-1.6)`);
      return createEmptyAnalysis(`R:R ${rrRatio.toFixed(2)} fora do range 1.3-1.6`);
    }

    risk = {
      entry: currentPrice,
      stop: stopLoss,
      target: takeProfit,
      rr_ratio: rrRatio,
    };

    confidence = 0.85;
    confirmation = 'NY breakout confirmed | Volume 1.5x+ | VWMA > EMA | MACD positive';
  }
  
  // SHORT setup
  else if (breakoutDown && volumeConfirmed && bearishAlignment) {
    signal = 'SHORT';
    direction = 'SHORT';
    
    const stopLoss = currentPrice + (atr * 1.0);
    const rangeAmplitude = rangeHigh - rangeLow;
    const takeProfit = currentPrice - (rangeAmplitude * 2);
    const rrRatio = Math.abs(currentPrice - takeProfit) / Math.abs(stopLoss - currentPrice);

    // ✅ FASE 2: Validar range de R:R (1.3 a 1.6)
    if (rrRatio < 1.3 || rrRatio > 1.6) {
      console.log(`❌ R:R fora do range aceitável: ${rrRatio.toFixed(2)} (esperado: 1.3-1.6)`);
      return createEmptyAnalysis(`R:R ${rrRatio.toFixed(2)} fora do range 1.3-1.6`);
    }

    risk = {
      entry: currentPrice,
      stop: stopLoss,
      target: takeProfit,
      rr_ratio: rrRatio,
    };

    confidence = 0.85;
    confirmation = 'NY breakout confirmed | Volume 1.5x+ | VWMA < EMA | MACD negative';
  }

  const notes = `NY Execution phase. Range breakout: ${breakoutUp ? 'UP' : breakoutDown ? 'DOWN' : 'NONE'}. Volume factor: ${volume.factor.toFixed(2)}. Signal: ${signal}`;

  return {
    signal,
    direction,
    c1Direction: lastC1Direction,
    volumeFactor: volume.factor,
    confirmation,
    risk,
    confidence,
    notes,
    marketData: { price: currentPrice, vwma, ema, macd, rsi, atr },
    rangeHigh: londonRange.high,
    rangeLow: londonRange.low,
  };
}

// Calculate all technical indicators
function calculateIndicators(candles5m: any[], candles15m: any[], candles1h: any[]) {
  const closes5m = candles5m.map((c: any) => c.close);
  const volumes5m = candles5m.map((c: any) => c.volume);
  const closes15m = candles15m.map((c: any) => c.close);
  const closes1h = candles1h.map((c: any) => c.close);

  // RSI (14 period on M5)
  const rsi = calculateRSI(closes5m.slice(-15));

  // VWMA (Volume Weighted Moving Average)
  const vwma = calculateVWMA(candles5m.slice(-20));

  // EMA (20 period)
  const ema = calculateEMA(closes5m.slice(-20), 20);

  // MACD
  const macd = calculateMACD(closes5m);

  // ATR (14 period)
  const atr = calculateATR(candles5m.slice(-15));

  // Volume analysis
  const avgVolume = volumes5m.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;
  const currentVolume = volumes5m[volumes5m.length - 1];
  const volumeFactor = currentVolume / avgVolume;

  // Trend (from 1h)
  const trend = closes1h[closes1h.length - 1] > closes1h[closes1h.length - 5] ? 'UP' : 'DOWN';

  // Slope (rate of change on M15)
  const slope = (closes15m[closes15m.length - 1] - closes15m[closes15m.length - 3]) / closes15m[closes15m.length - 3];

  return {
    rsi,
    vwma,
    ema,
    macd,
    atr,
    volume: { factor: volumeFactor, current: currentVolume, average: avgVolume },
    trend,
    slope,
  };
}

// RSI calculation
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
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

// VWMA calculation
function calculateVWMA(candles: any[]): number {
  let totalPV = 0;
  let totalV = 0;
  
  for (const candle of candles) {
    totalPV += candle.close * candle.volume;
    totalV += candle.volume;
  }
  
  return totalV > 0 ? totalPV / totalV : candles[candles.length - 1].close;
}

// EMA calculation
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];
  
  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }
  
  return ema;
}

// MACD calculation (simplified)
function calculateMACD(prices: number[]): number {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  return ema12 - ema26;
}

// ATR calculation
function calculateATR(candles: any[], period: number = 14): number {
  if (candles.length < period) return 0;
  
  let sum = 0;
  for (let i = 1; i < period; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
  }
  
  return sum / (period - 1);
}

// Scan market for valid trading pairs with sufficient volume
async function scanMarketForValidPairs(): Promise<string[]> {
  try {
    // Fetch all USDT perpetual contracts from Binance Futures
    const response = await fetch('https://fapi.binance.com/fapi/v1/exchangeInfo');
    
    if (!response.ok) {
      console.error('Failed to fetch exchange info');
      return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']; // Fallback to default pairs
    }

    const data = await response.json();
    const symbols = data.symbols
      .filter((s: any) => 
        s.status === 'TRADING' && 
        s.quoteAsset === 'USDT' && 
        s.contractType === 'PERPETUAL'
      )
      .map((s: any) => s.symbol);

    console.log(`Total USDT perpetual pairs available: ${symbols.length}`);

    // Get 24h ticker data to filter by volume
    const tickerResponse = await fetch('https://fapi.binance.com/fapi/v1/ticker/24hr');
    
    if (!tickerResponse.ok) {
      console.error('Failed to fetch ticker data');
      return symbols.slice(0, 10); // Return first 10 if ticker fails
    }

    const tickers = await tickerResponse.json();
    
    // Filter pairs with high volume (minimum $50M daily volume)
    const MIN_VOLUME_USD = 50_000_000;
    
    const validPairs = tickers
      .filter((t: any) => {
        const volumeUSD = parseFloat(t.quoteVolume);
        const priceChange = Math.abs(parseFloat(t.priceChangePercent));
        
        return (
          symbols.includes(t.symbol) &&
          volumeUSD >= MIN_VOLUME_USD &&
          priceChange >= 0.5 && // At least 0.5% movement
          priceChange <= 20 // Not more than 20% (avoid extreme volatility)
        );
      })
      .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume)) // Sort by volume
      .slice(0, 15) // Top 15 pairs
      .map((t: any) => t.symbol);

    console.log(`Filtered to ${validPairs.length} high-quality pairs with volume >= $${MIN_VOLUME_USD.toLocaleString()}`);

    return validPairs.length > 0 ? validPairs : ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
  } catch (error) {
    console.error('Error in market scan:', error);
    return ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']; // Fallback
  }
}

// Fetch candles from Binance
async function fetchCandlesFromBinance(symbol: string) {
  const intervals = ['5m', '15m', '1h'];
  const allCandles: any = {};

  for (const interval of intervals) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=100`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch ${interval} candles for ${symbol}`);
      continue;
    }

    const data = await response.json();
    allCandles[interval] = data.map((k: any) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  }

  return allCandles;
}

// Execute trade signal
async function executeTradeSignal(supabase: any, asset: string, analysis: any, settings: any, currentSession: string, userId: string) {
  if (!analysis.risk) return;

  console.log(`✅ Executing trade for user ${userId}`);

  // CRITICAL: Validate balance before executing trade
  if (!settings.balance || settings.balance <= 0) {
    console.error('❌ SALDO INSUFICIENTE - Cannot execute trade');
    console.error(`Balance: $${settings.balance || 0}`);
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Trade Executor',
      asset: asset,
      status: 'error',
      data: {
        error: 'Saldo insuficiente',
        message: 'O saldo está zerado ou negativo. Não é possível executar trades.',
        balance: settings.balance || 0,
        required_minimum: 10,
      }
    });
    return;
  }

  // Validate minimum balance of $10
  if (settings.balance < 10) {
    console.error('❌ SALDO MUITO BAIXO - Cannot execute trade');
    console.error(`Balance: $${settings.balance} | Minimum required: $10`);
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Trade Executor',
      asset: asset,
      status: 'error',
      data: {
        error: 'Saldo muito baixo',
        message: 'O saldo mínimo para operar é de $10 USD.',
        balance: settings.balance,
        required_minimum: 10,
      }
    });
    return;
  }

  const { entry, stop, target, rr_ratio } = analysis.risk;
  
  // ✅ FASE 1: Dividir risco pelo número de posições simultâneas
  const adjustedRisk = settings.risk_per_trade / settings.max_positions;
  const positionSize = (settings.balance * adjustedRisk) / Math.abs(entry - stop);
  const projectedProfit = positionSize * Math.abs(target - entry);

  // ✅ FASE 4: Log completo de gestão de risco
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 ANÁLISE DE RISCO - ${asset}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💰 Saldo: $${settings.balance.toFixed(2)}
🎯 Max Posições: ${settings.max_positions}
📉 Risco Total: ${(settings.risk_per_trade * 100).toFixed(1)}%
📊 Risco por Posição: ${(adjustedRisk * 100).toFixed(1)}%
💵 Tamanho da Posição: ${positionSize.toFixed(4)} contratos
📈 Entry: $${entry.toFixed(2)} | Stop: $${stop.toFixed(2)} | Target: $${target.toFixed(2)}
🎲 R:R: ${rr_ratio.toFixed(2)}:1
💎 Lucro Projetado: $${projectedProfit.toFixed(2)}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  // Check if position size is valid
  if (positionSize <= 0 || !isFinite(positionSize)) {
    console.error('❌ INVALID POSITION SIZE');
    console.error(`Position size: ${positionSize} | Balance: $${settings.balance} | Risk: ${settings.risk_per_trade}`);
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Trade Executor',
      asset: asset,
      status: 'error',
      data: {
        error: 'Tamanho de posição inválido',
        balance: settings.balance,
        risk_per_trade: settings.risk_per_trade,
        position_size: positionSize,
      }
    });
    return;
  }

  // Final validation: ensure we have enough balance for the position
  const minimumRequired = positionSize * 0.01; // At least 1% margin
  if (settings.balance < minimumRequired) {
    console.error('❌ SALDO INSUFICIENTE PARA POSIÇÃO');
    console.error(`Balance: $${settings.balance} | Required: $${minimumRequired.toFixed(2)}`);
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Trade Executor',
      asset: asset,
      status: 'error',
      data: {
        error: 'Saldo insuficiente para posição',
        message: 'O saldo disponível não é suficiente para abrir esta posição com segurança.',
        balance: settings.balance,
        required: minimumRequired,
        position_size: positionSize,
      }
    });
    return;
  }

  console.log(`✅ VALIDAÇÃO DE SALDO OK - Balance: $${settings.balance} | Position Size: ${positionSize.toFixed(4)}`);


  console.log(`Executing ${analysis.signal} signal for ${asset}`);

  // ✅ Insert position COM user_id
  const { data: newPosition, error } = await supabase
    .from('active_positions')
    .insert({
      user_id: userId,
      asset,
      direction: mapDirection(analysis.signal),
      entry_price: entry,
      stop_loss: stop,
      take_profit: target,
      risk_reward: rr_ratio,
      current_price: entry,
      current_pnl: 0,
      projected_profit: projectedProfit,
      agents: { 'Cycle Orchestrator': analysis.confirmation },
      session: mapSession(currentSession),
    })
    .select();

  if (error) {
    console.error('❌ ERROR INSERTING ACTIVE POSITION:', error);
    console.error('Asset:', asset);
    console.error('Direction:', analysis.signal);
    console.error('Entry:', entry, 'Stop:', stop, 'Target:', target);
    console.error('Error details:', JSON.stringify({
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    }));
    
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Trade Executor',
      asset: asset,
      status: 'error',
      data: {
        error: 'Failed to insert active_position',
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        position_data: {
          asset,
          direction: analysis.signal,
          entry_price: entry,
          stop_loss: stop,
          take_profit: target,
          risk_reward: rr_ratio,
        }
      }
    });
    return;
  }

  // ✅ Insert operation COM user_id
  const { error: opError } = await supabase.from('operations').insert({
    user_id: userId,
    asset,
    direction: mapDirection(analysis.signal),
    entry_price: entry,
    stop_loss: stop,
    take_profit: target,
    risk_reward: rr_ratio,
    agents: { 'Cycle Orchestrator': analysis.confirmation },
    session: mapSession(currentSession),
    result: 'OPEN',
  });

  if (opError) {
    console.error('❌ ERROR INSERTING OPERATION:', opError);
    console.error('Asset:', asset);
    console.error('Error details:', JSON.stringify({
      message: opError.message,
      details: opError.details,
      hint: opError.hint,
      code: opError.code,
    }));
    
    await supabase.from('agent_logs').insert({
      user_id: userId,
      agent_name: 'Trade Executor',
      asset: asset,
      status: 'error',
      data: {
        error: 'Failed to insert operation',
        message: opError.message,
        details: opError.details,
        hint: opError.hint,
      }
    });
  }

  console.log(`✅ Position opened successfully for ${asset}`);

  // Notify AI Agent - Agente de Execução e Confluência
  try {
    console.log(`🤖 Calling Agente Execução e Confluência for ${asset}...`);
    const agentResponse = await fetch(AGENTE_EXECUCAO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset,
        direction: mapDirection(analysis.signal),
        entry_price: entry,
        stop_loss: stop,
        take_profit: target,
        risk_reward: rr_ratio,
        position_size: projectedProfit,
        timestamp: new Date().toISOString(),
      }),
    });

    if (agentResponse.ok) {
      const agentData = await agentResponse.json();
      console.log(`✅ Agent Execução: ${agentData.decision} | Confluence: ${agentData.confluenceScore}/100`);
    }
  } catch (agentError) {
    console.error('❌ Agente Execução e Confluência error:', agentError);
  }
}

// Monitor and update active positions
async function monitorActivePositions(supabase: any, positions: any[], userId: string) {
  for (const position of positions) {
    try {
      const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${position.asset}`;
      const response = await fetch(url);
      const data = await response.json();
      const currentPrice = parseFloat(data.price);

      const priceDiff = position.direction === 'BUY' 
        ? currentPrice - position.entry_price
        : position.entry_price - currentPrice;
      
      const rMultiple = priceDiff / Math.abs(position.entry_price - position.stop_loss);
      const currentPnl = priceDiff * 100;

      await supabase.from('active_positions').update({ 
        current_price: currentPrice,
        current_pnl: currentPnl 
      }).eq('id', position.id);

      const tpHit = position.direction === 'BUY' 
        ? currentPrice >= position.take_profit
        : currentPrice <= position.take_profit;
      
      const slHit = position.direction === 'BUY'
        ? currentPrice <= position.stop_loss
        : currentPrice >= position.stop_loss;

      if (tpHit || slHit) {
        const result = tpHit ? 'WIN' : 'LOSS';
        console.log(`Position ${position.asset} closed: ${result}`);

        await supabase.from('active_positions').delete().eq('id', position.id);

        await supabase.from('operations').update({
          exit_price: currentPrice,
          exit_time: new Date().toISOString(),
          result,
          pnl: currentPnl,
        }).eq('asset', position.asset).eq('result', 'OPEN');

        const today = new Date().toISOString().split('T')[0];
        // ✅ Buscar daily_goal POR USUÁRIO
        const { data: goal } = await supabase
          .from('daily_goals')
          .select('*')
          .eq('user_id', userId)
          .eq('date', today)
          .single();

        if (goal) {
          const newTotalOps = goal.total_operations + 1;
          const newWins = result === 'WIN' ? goal.wins + 1 : goal.wins;
          const newLosses = result === 'LOSS' ? goal.losses + 1 : goal.losses;
          const newTotalPnl = goal.total_pnl + currentPnl;

          // Calculate projected completion time
          const now = new Date();
          const todayStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
          const elapsedHours = (now.getTime() - todayStart.getTime()) / (1000 * 60 * 60);
          
          let projectedCompletionTime = null;
          if (newTotalOps > 0 && elapsedHours > 0) {
            const opsPerHour = newTotalOps / elapsedHours;
            const remainingOps = 45 - newTotalOps;
            
            if (remainingOps > 0 && opsPerHour > 0) {
              const hoursToComplete = remainingOps / opsPerHour;
              projectedCompletionTime = new Date(now.getTime() + (hoursToComplete * 60 * 60 * 1000)).toISOString();
            }
          }

          // ✅ Update daily_goal POR USUÁRIO
          await supabase.from('daily_goals').update({
            total_operations: newTotalOps,
            wins: newWins,
            losses: newLosses,
            total_pnl: newTotalPnl,
            projected_completion_time: projectedCompletionTime,
          }).eq('user_id', userId).eq('date', today);
        }

        // Notify AI Agent - Agente de Gestão de Risco
        try {
          console.log(`🤖 Calling Agente Gestão de Risco for ${position.asset}...`);
          const agentResponse = await fetch(AGENTE_GESTAO_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              asset: position.asset,
              result,
              entry_price: position.entry_price,
              exit_price: currentPrice,
              pnl: currentPnl,
              direction: position.direction,
              position_data: position,
              timestamp: new Date().toISOString(),
            }),
          });

          if (agentResponse.ok) {
            const agentData = await agentResponse.json();
            console.log(`✅ Agent Gestão de Risco: Score ${agentData.riskManagementScore}/100 | Lessons: ${agentData.lessons}`);
          }
        } catch (agentError) {
          console.error('❌ Agente Gestão de Risco error:', agentError);
        }
      }
      else if (rMultiple >= 1 && Math.abs(position.stop_loss - position.entry_price) > 0.01) {
        console.log(`Moving SL to BE for ${position.asset}`);
        await supabase.from('active_positions').update({ stop_loss: position.entry_price }).eq('id', position.id);
      }
    } catch (error) {
      console.error(`Error monitoring position ${position.asset}:`, error);
    }
  }
}

// Helper to create empty analysis
function createEmptyAnalysis(reason: string) {
  return {
    signal: 'STAY_OUT',
    direction: 'NEUTRAL',
    c1Direction: null,
    volumeFactor: 0,
    confirmation: reason,
    risk: null,
    confidence: 0,
    notes: reason,
    marketData: {},
    rangeHigh: null,
    rangeLow: null,
  };
}