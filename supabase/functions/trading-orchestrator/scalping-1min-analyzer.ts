/**
 * ANALISADOR PRINCIPAL - ESTRATÉGIA SCALPING 1 MINUTO
 * 
 * Integra todos os módulos de detecção para executar a estratégia completa:
 * 1. Foundation (primeira vela 5min)
 * 2. FVG Detection (Fair Value Gap)
 * 3. Pullback/Retest
 * 4. Engulfing Candle
 * 
 * REGRAS CRÍTICAS:
 * - Máximo 1 trade por sessão
 * - Risk/Reward SEMPRE 3:1
 * - Estratégia 100% mecânica (sem interpretação)
 */

import { getOrCreateFoundation } from './scalping-1min-foundation.ts';
import { detectFVG } from './scalping-1min-fvg.ts';
import { detectPullbackToFVG } from './scalping-1min-retest.ts';
import { detectEngulfingCandle } from './scalping-1min-engulfing.ts';

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
  session: string;
  userId: string;
  supabase: any;
}

interface AnalysisResult {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  direction?: string | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  notes: string;
  confirmation?: string;
  volumeFactor?: number;
  c1Direction?: string | null;
  rangeHigh?: number;
  rangeLow?: number;
  marketData?: any;
  risk?: any;
  foundation?: any;
  fvg?: any;
  retestCandle?: any;
  engulfingCandle?: any;
  phase: string;
}

/**
 * Analisa o mercado usando a estratégia de Scalping 1 Minuto
 */
export async function analyzeScalping1Min(params: AnalysisParams): Promise<AnalysisResult> {
  const { candles, asset, session, userId, supabase } = params;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ANÁLISE SCALPING 1MIN - ${asset} | Sessão: ${session}`);
  console.log(`${'='.repeat(80)}`);
  
  // ==========================================
  // PASSO 1: OBTER/CRIAR FUNDAÇÃO DA SESSÃO
  // ==========================================
  console.log(`\n📍 PASSO 1: Verificando Fundação da Sessão...`);
  const foundation = await getOrCreateFoundation(session, candles['5m'], userId, supabase);
  
  if (!foundation.valid) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏳ Aguardando primeira vela de 5min da sessão ${session}`,
      phase: 'WAITING_FOUNDATION'
    };
  }
  
  console.log(`✅ Fundação válida: HIGH ${foundation.high} | LOW ${foundation.low}`);
  
  // ==========================================
  // PASSO 2: DETECTAR FVG COM BREAKOUT
  // ==========================================
  console.log(`\n📍 PASSO 2: Detectando Fair Value Gap (FVG)...`);
  const fvg = detectFVG(candles['1m'], foundation.high, foundation.low);
  
  if (!fvg.fvgDetected || !fvg.breakoutConfirmed) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: fvg.fvgDetected 
        ? '⏳ FVG detectado mas sem breakout confirmado'
        : '⏳ Aguardando formação de FVG válido',
      foundation,
      phase: 'WAITING_FVG'
    };
  }
  
  console.log(`✅ FVG ${fvg.direction} detectado com breakout confirmado`);
  
  // ==========================================
  // PASSO 3: DETECTAR PULLBACK PARA FVG
  // ==========================================
  console.log(`\n📍 PASSO 3: Detectando Pullback para zona FVG...`);
  
  // TypeScript safety check
  if (!fvg.direction) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: '⏳ Erro: FVG sem direção definida',
      foundation,
      fvg,
      phase: 'ERROR_FVG_DIRECTION'
    };
  }
  
  const pullback = detectPullbackToFVG(
    candles['1m'],
    { top: fvg.fvgTop, bottom: fvg.fvgBottom },
    fvg.direction,
    fvg.candles!
  );
  
  if (!pullback.retestDetected) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏳ FVG ${fvg.direction} ativo - Aguardando pullback para zona FVG`,
      foundation,
      fvg,
      phase: 'WAITING_PULLBACK'
    };
  }
  
  console.log(`✅ Pullback detectado - Preço retestou zona FVG`);
  
  // ==========================================
  // PASSO 4: DETECTAR VELA DE ENGOLFO
  // ==========================================
  console.log(`\n📍 PASSO 4: Detectando Vela de Engolfo...`);
  const engulfing = await detectEngulfingCandle(
    candles['1m'],
    pullback.retestCandle!,
    fvg.direction,
    asset
  );
  
  if (!engulfing.engulfingDetected) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏳ Pullback completo - Aguardando vela de engolfo ${fvg.direction}`,
      foundation,
      fvg,
      retestCandle: pullback.retestCandle,
      phase: 'WAITING_ENGULFING'
    };
  }
  
  console.log(`✅ Vela de engolfo detectada - Todos os critérios atendidos!`);
  
  // ==========================================
  // PASSO 5: VERIFICAR LIMITE DE 1 TRADE POR SESSÃO
  // ==========================================
  console.log(`\n📍 PASSO 5: Verificando limite de trades da sessão...`);
  const tradeCount = await getSessionTradeCount(session, userId, supabase);
  
  if (tradeCount >= 1) {
    console.log(`⏸️ Limite atingido: ${tradeCount}/1 trade executado nesta sessão`);
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏸️ Setup válido mas limite de 1 trade por sessão ${session} já atingido (${tradeCount}/1)`,
      foundation,
      fvg,
      retestCandle: pullback.retestCandle,
      engulfingCandle: engulfing.engulfingCandle,
      phase: 'SESSION_LIMIT_REACHED'
    };
  }
  
  console.log(`✅ Sessão disponível: ${tradeCount}/1 trades executados`);
  
  // ==========================================
  // ✅ SINAL VÁLIDO - EXECUTAR TRADE!
  // ==========================================
  
  // Final type safety check
  if (!fvg.direction || (fvg.direction !== 'BUY' && fvg.direction !== 'SELL')) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: '⏳ Erro: Direção FVG inválida',
      foundation,
      fvg,
      retestCandle: pullback.retestCandle,
      engulfingCandle: engulfing.engulfingCandle,
      phase: 'ERROR_INVALID_DIRECTION'
    };
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 SINAL VÁLIDO - PRONTO PARA EXECUTAR!`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📊 Direção: ${fvg.direction}`);
  console.log(`💰 Entry: ${engulfing.entryPrice}`);
  console.log(`🛑 Stop Loss: ${engulfing.stopLoss}`);
  console.log(`🎯 Take Profit: ${engulfing.takeProfit}`);
  console.log(`📈 Risk/Reward: ${engulfing.riskReward}:1`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Incrementar contador de trades da sessão
  await incrementSessionTradeCount(session, userId, supabase);
  
  return {
    signal: fvg.direction,
    direction: fvg.direction === 'BUY' ? 'LONG' : 'SHORT',
    entryPrice: engulfing.entryPrice,
    stopLoss: engulfing.stopLoss,
    takeProfit: engulfing.takeProfit,
    riskReward: 3,  // SEMPRE 3:1
    confidence: 0.95,  // Alta confiança (estratégia mecânica)
    notes: `✅ Scalping 1Min: Foundation ${foundation.high.toFixed(5)}/${foundation.low.toFixed(5)} | FVG ${fvg.direction} confirmado | Engulfing ✅ | R:R 3:1`,
    confirmation: `FVG ${fvg.direction} + Pullback + Engulfing`,
    volumeFactor: 1.0,
    c1Direction: null,
    rangeHigh: foundation.high,
    rangeLow: foundation.low,
    marketData: {
      foundation: { high: foundation.high, low: foundation.low },
      fvg: { top: fvg.fvgTop, bottom: fvg.fvgBottom, direction: fvg.direction },
      retestCandle: pullback.retestCandle,
      engulfingCandle: engulfing.engulfingCandle,
    },
    risk: {
      entry: engulfing.entryPrice,
      stop: engulfing.stopLoss,
      target: engulfing.takeProfit,
      rr_ratio: 3,
    },
    foundation,
    fvg,
    retestCandle: pullback.retestCandle,
    engulfingCandle: engulfing.engulfingCandle,
    phase: 'SIGNAL_CONFIRMED'
  };
}

/**
 * Obtém quantidade de trades já executados na sessão atual
 */
async function getSessionTradeCount(
  session: string,
  userId: string,
  supabase: any
): Promise<number> {
  const today = new Date().toISOString().split('T')[0];
  
  const { data, error } = await supabase
    .from('session_trade_count')
    .select('trade_count')
    .eq('user_id', userId)
    .eq('session', session)
    .eq('date', today)
    .maybeSingle();
  
  if (error) {
    console.error('❌ Erro ao buscar trade count:', error);
    return 0;
  }
  
  return data?.trade_count || 0;
}

/**
 * Incrementa contador de trades da sessão
 */
async function incrementSessionTradeCount(
  session: string,
  userId: string,
  supabase: any
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  // Tentar inserir novo registro
  const { error: insertError } = await supabase
    .from('session_trade_count')
    .insert({
      user_id: userId,
      session,
      date: today,
      trade_count: 1
    });
  
  if (insertError) {
    // Se já existe, incrementar
    if (insertError.code === '23505') { // Unique violation
      const { error: updateError } = await supabase
        .from('session_trade_count')
        .update({
          trade_count: supabase.raw('trade_count + 1'),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('session', session)
        .eq('date', today);
      
      if (updateError) {
        console.error('❌ Erro ao incrementar trade count:', updateError);
      }
    } else {
      console.error('❌ Erro ao inserir trade count:', insertError);
    }
  }
  
  console.log(`✅ Contador de trades incrementado para sessão ${session}`);
}
