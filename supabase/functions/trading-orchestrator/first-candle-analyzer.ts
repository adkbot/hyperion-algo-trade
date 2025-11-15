// ============================================
// FIRST CANDLE RULE - MAIN ANALYZER
// ============================================
// Orquestrador da estratégia First Candle Rule
// Sequência: Foundation → Breakout → Engulfing → Execução

import { getOrCreateFirstCandleFoundation } from './first-candle-foundation.ts';
import { detectBreakout } from './first-candle-breakout.ts';
import { detectEngulfingAfterRetest } from './first-candle-engulfing.ts';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AnalysisParams {
  candles: {
    '1m': Candle[];
    '5m': Candle[];
  };
  asset: string;
  userId: string;
  supabase: any;
}

interface AnalysisResult {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  direction: 'BUY' | 'SELL' | null;
  confidence: number;
  notes: string;
  risk: {
    entry: number;      // ✅ CORRIGIDO: usar 'entry' em vez de 'entryPrice'
    stop: number;       // ✅ CORRIGIDO: usar 'stop' em vez de 'stopLoss'
    target: number;     // ✅ CORRIGIDO: usar 'target' em vez de 'takeProfit'
    rr_ratio: number;   // ✅ CORRIGIDO: usar 'rr_ratio' em vez de 'riskReward'
  } | null;
  volumeFactor?: number;
  confirmation?: string;
  c1Direction?: string;
  rangeHigh?: number;
  rangeLow?: number;
  marketData?: any;
}

/**
 * Analisa o mercado usando a estratégia First Candle Rule
 */
export async function analyzeFirstCandleRule(params: AnalysisParams): Promise<AnalysisResult | null> {
  const { candles, asset, userId, supabase } = params;
  
  console.log(`\n🎯 ========== FIRST CANDLE RULE ANALYSIS: ${asset} ==========`);
  
  // PASSO 1: Buscar ou criar Foundation (First 5-min High/Low)
  const foundation = await getOrCreateFirstCandleFoundation(candles['5m'], userId, supabase);
  
  if (!foundation.isValid) {
    console.log(`⏳ Foundation ainda não disponível para ${foundation.session}. Aguardando...`);
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      notes: `Aguardando primeira vela de 5 min do ciclo ${foundation.session}`,
      risk: null,
    };
  }
  
  console.log(`✅ Foundation ativa (${foundation.session}): High ${foundation.high}, Low ${foundation.low}`);
  
  // Salvar evento de Foundation detectada
  await supabase.from('session_history').insert({
    user_id: userId,
    session: foundation.session,
    pair: asset,
    cycle_phase: 'Projection',
    signal: 'STAY_OUT',
    confidence_score: 0,
    notes: `✅ Foundation detectada: H ${foundation.high} | L ${foundation.low}`,
    event_type: 'FOUNDATION_DETECTED',
    event_data: { high: foundation.high, low: foundation.low },
    timestamp: new Date().toISOString(),
  });
  
  // ==========================================
  // PASSO 1.5: VALIDAÇÃO CRÍTICA - JANELA DE OPERAÇÃO (5 MINUTOS)
  // ==========================================
  console.log(`\n📍 PASSO 1.5: Validando JANELA DE OPERAÇÃO (CRÍTICO)...`);

  const foundationTime = new Date(foundation.timestamp).getTime();
  const currentTime = Date.now();
  const OPERATION_WINDOW_MS = 5 * 60 * 1000; // 5 minutos
  const windowEnd = foundationTime + OPERATION_WINDOW_MS;

  console.log(`   ├─ Foundation: ${new Date(foundationTime).toISOString()}`);
  console.log(`   ├─ Atual: ${new Date(currentTime).toISOString()}`);
  console.log(`   └─ Janela fecha: ${new Date(windowEnd).toISOString()}`);

  if (currentTime > windowEnd) {
    const minutesElapsed = Math.floor((currentTime - foundationTime) / 1000 / 60);
    
    console.log(`❌ JANELA FECHADA! Foundation há ${minutesElapsed} minutos`);
    
    await supabase.from('session_history').insert({
      user_id: userId,
      session: foundation.session,
      pair: asset,
      cycle_phase: 'Execution',
      event_type: 'OPERATION_WINDOW_CLOSED',
      signal: 'STAY_OUT',
      direction: null,
      notes: `⏸️ Janela fechada. Foundation há ${minutesElapsed}min (limite: 5min)`,
      timestamp: new Date().toISOString(),
      market_data: {
        foundation: { 
          high: foundation.high, 
          low: foundation.low,
          timestamp: foundation.timestamp,
          session: foundation.session
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
      direction: null,
      confidence: 0,
      notes: `⏸️ JANELA FECHADA: Foundation há ${minutesElapsed}min. Apenas primeiros 5min permitidos.`,
      risk: null
    };
  }

  const minutesRemaining = Math.floor((windowEnd - currentTime) / 1000 / 60);
  const secondsRemaining = Math.floor(((windowEnd - currentTime) % (60 * 1000)) / 1000);
  console.log(`✅ JANELA ABERTA: ${minutesRemaining}min ${secondsRemaining}s restantes`);
  
  // Verificar se já executamos 1 trade neste ciclo hoje
  const today = new Date().toISOString().split('T')[0];
  const { data: todayTrades } = await supabase
    .from('operations')
    .select('*')
    .eq('user_id', userId)
    .eq('session', foundation.session)
    .gte('entry_time', `${today}T00:00:00Z`)
    .lte('entry_time', `${today}T23:59:59Z`);
  
  if (todayTrades && todayTrades.length >= 1) {
    console.log(`⏸️ Ciclo ${foundation.session} já teve 1 trade hoje. Aguardando próximo ciclo.`);
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      notes: `Ciclo ${foundation.session} já executou 1 trade hoje (limite: 1 por ciclo)`,
      risk: null,
    };
  }
  
  // PASSO 2: Detectar Breakout
  const breakoutResult = await detectBreakout(
    candles['1m'],
    foundation.high,
    foundation.low
  );
  
  if (!breakoutResult.hasBreakout) {
    console.log(`⏳ Aguardando breakout do First 5-min High/Low...`);
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      notes: `Aguardando breakout. Foundation: High ${foundation.high}, Low ${foundation.low}`,
      risk: null,
    };
  }
  
  console.log(`✅ Breakout confirmado: ${breakoutResult.direction} @ ${breakoutResult.breakoutPrice}`);
  
  // Salvar evento de Breakout
  await supabase.from('session_history').insert({
    user_id: userId,
    session: foundation.session,
    pair: asset,
    cycle_phase: 'Consolidation',
    direction: breakoutResult.direction,
    signal: 'STAY_OUT',
    confidence_score: 0,
    notes: `⚡ Breakout ${breakoutResult.direction} @ ${breakoutResult.breakoutPrice}. Aguardando engulfing...`,
    event_type: 'BREAKOUT',
    event_data: { price: breakoutResult.breakoutPrice, direction: breakoutResult.direction },
    timestamp: new Date().toISOString(),
  });
  
  // PASSO 3: Detectar Engulfing IMEDIATO após breakout
  const engulfingResult = await detectEngulfingAfterRetest(
    candles['1m'],
    breakoutResult.breakoutCandle!,
    breakoutResult.direction!,
    asset
  );
  
  if (!engulfingResult.hasEngulfing) {
    console.log(`⏳ Aguardando vela de engulfing após breakout...`);
    return {
      signal: 'STAY_OUT',
      direction: breakoutResult.direction,
      confidence: 0,
      notes: `Breakout ${breakoutResult.direction} confirmado. Aguardando engulfing.`,
      risk: null,
    };
  }
  
  console.log(`🎯 ✅ SEQUÊNCIA COMPLETA CONFIRMADA!`);
  console.log(`   1. ✅ Foundation detectada: ${foundation.session}`);
  console.log(`   2. ✅ Breakout: ${breakoutResult.direction} @ ${breakoutResult.breakoutPrice}`);
  console.log(`   3. ✅ Engulfing confirmado`);
  console.log(`   📊 Entry: ${engulfingResult.entryPrice} | Stop: ${engulfingResult.stopLoss} | TP: ${engulfingResult.takeProfit}`);
  console.log(`   💰 RR: ${engulfingResult.riskReward.toFixed(2)}:1`);
  
  // Salvar evento de Engulfing confirmado (entrada!)
  await supabase.from('session_history').insert({
    user_id: userId,
    session: foundation.session,
    pair: asset,
    cycle_phase: 'Execution',
    direction: breakoutResult.direction,
    signal: breakoutResult.direction,
    confidence_score: 95,
    notes: `🚀 ENGULFING confirmado! Entrada ${breakoutResult.direction} ativada.`,
    event_type: 'ENGULFING',
    event_data: { 
      breakoutPrice: breakoutResult.breakoutPrice,
      engulfingPrice: engulfingResult.engulfingCandle?.close,
      entryPrice: engulfingResult.entryPrice,
      stopLoss: engulfingResult.stopLoss,
      takeProfit: engulfingResult.takeProfit,
      riskReward: engulfingResult.riskReward,
    },
    timestamp: new Date().toISOString(),
  });
  
  // EXECUTAR ENTRADA!
  console.log(`🔍 DEBUG: Preparando para retornar sinal de trade...`);
  console.log(`   Signal: ${breakoutResult.direction}`);
  console.log(`   Entry: ${engulfingResult.entryPrice}`);
  console.log(`   Stop: ${engulfingResult.stopLoss}`);
  console.log(`   TP: ${engulfingResult.takeProfit}`);
  
  const result = {
    signal: breakoutResult.direction!,
    direction: breakoutResult.direction!,
    confidence: 0.95, // Alta confiança (sequência completa validada)
    notes: `First Candle Rule: Breakout → Engulfing confirmado. Ciclo: ${foundation.session}. RR ${engulfingResult.riskReward.toFixed(2)}:1`,
    risk: {
      entry: engulfingResult.entryPrice,      // ✅ CORRIGIDO: entry (não entryPrice)
      stop: engulfingResult.stopLoss,          // ✅ CORRIGIDO: stop (não stopLoss)
      target: engulfingResult.takeProfit,      // ✅ CORRIGIDO: target (não takeProfit)
      rr_ratio: engulfingResult.riskReward,    // ✅ CORRIGIDO: rr_ratio (não riskReward)
    },
    volumeFactor: 1.0,
    confirmation: 'ENGULFING_AFTER_BREAKOUT',
    c1Direction: breakoutResult.direction || undefined,
    rangeHigh: foundation.high,
    rangeLow: foundation.low,
    marketData: {
      foundationHigh: foundation.high,
      foundationLow: foundation.low,
      breakoutPrice: breakoutResult.breakoutPrice,
      session: foundation.session,
    },
  };
  
  console.log(`✅ RETORNANDO SINAL DE TRADE: ${breakoutResult.direction}`);
  console.log(`   Risk object:`, JSON.stringify(result.risk, null, 2));
  
  return result;
}
