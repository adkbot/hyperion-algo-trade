/**
 * ANALISADOR PRINCIPAL - ESTRATÉGIA SCALPING 1 MINUTO (MECÂNICO)
 * 
 * Metodologia simplificada baseada em FVG:
 * 1. Foundation (primeira vela 5min)
 * 2. FVG Detection (Fair Value Gap) + Breakout
 * 3. ENTRADA IMEDIATA após 3ª vela do FVG fechar
 * 
 * REGRAS CRÍTICAS:
 * - Máximo 1 trade por sessão
 * - Risk/Reward SEMPRE 3:1
 * - Entry: fechamento da 3ª vela do FVG
 * - Stop: base/topo do FVG
 * - Estratégia 100% mecânica (sem interpretação)
 */

import { getOrCreateFoundation } from './scalping-1min-foundation.ts';
import { detectFVG } from './scalping-1min-fvg.ts';
import { validateTrend, TrendValidation } from './scalping-1min-trend-validator.ts';

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
  trendValidation?: TrendValidation;
  phase: string;
  session?: string; // ✅ Adicionar session para incrementar contador após sucesso
}

/**
 * Analisa o mercado usando a estratégia de Scalping 1 Minuto
 */
export async function analyzeScalping1Min(params: AnalysisParams): Promise<AnalysisResult> {
  const { candles, asset, session, userId, supabase } = params;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 ANÁLISE SCALPING 1MIN - ${asset} | Sessão: ${session}`);
  console.log(`${'='.repeat(80)}`);
  
  // ✅ FOUNDATION DESABILITADA - Operando sem restrição de vela de 5 minutos
  console.log(`\n📍 PASSO 1: Foundation desabilitada para SCALPING 1MIN - operando sem restrição de tempo`);
  
  const foundation = {
    session,
    high: 0,
    low: 0,
    timestamp: Date.now(),
    valid: true
  };
  
  console.log(`\n📍 PASSO 1.5: Validação de janela de operação DESABILITADA`);
  

  
  // ==========================================
  // REGRA 1: FILTRO DE QUALIDADE POR SESSÃO
  // ==========================================
  console.log(`\n📍 VERIFICANDO FILTRO DE SESSÃO...`);
  
  // ==========================================
  // REGRA 1: FILTRO DE QUALIDADE POR SESSÃO
  // ==========================================
  console.log(`\n📍 VERIFICANDO FILTRO DE SESSÃO...`);
  
  const isStrictSession = session === 'OCEANIA' || session === 'ASIA';
  
  if (isStrictSession) {
    console.log(`⚠️ Sessão ${session} - MODO RIGOROSO ativado`);
    console.log(`└─ Setup deve ser PERFEITO para operar`);
    
    // Verificações extras de qualidade
    const foundationRange = (foundation.high - foundation.low) / foundation.low;
    const minRangeRequired = 0.003; // 0.3% mínimo
    
    if (foundationRange < minRangeRequired) {
      return {
        signal: 'STAY_OUT',
        direction: null,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        confidence: 0,
        notes: `⏸️ Sessão ${session}: Foundation range muito baixo (${(foundationRange * 100).toFixed(2)}%) - Requer >= 0.3%`,
        phase: 'SESSION_FILTER_REJECTED'
      };
    }
    
    console.log(`✅ Foundation range OK: ${(foundationRange * 100).toFixed(2)}%`);
  }
  
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
  console.log(`   ├─ Vela 1: O=${fvg.candles![0].open} H=${fvg.candles![0].high} L=${fvg.candles![0].low} C=${fvg.candles![0].close}`);
  console.log(`   ├─ Vela 2 (breakout): O=${fvg.candles![1].open} H=${fvg.candles![1].high} L=${fvg.candles![1].low} C=${fvg.candles![1].close}`);
  console.log(`   ├─ Vela 3 (entry): O=${fvg.candles![2].open} H=${fvg.candles![2].high} L=${fvg.candles![2].low} C=${fvg.candles![2].close}`);
  console.log(`   └─ FVG Zone: ${fvg.fvgBottom} - ${fvg.fvgTop}`);
  
  // Validação extra para sessões rigorosas (OCEANIA/ASIA)
  if (isStrictSession) {
    const fvgSize = (fvg.fvgTop - fvg.fvgBottom) / fvg.fvgBottom;
    const minFvgSize = 0.002; // 0.2%
    
    if (fvgSize < minFvgSize) {
      return {
        signal: 'STAY_OUT',
        direction: null,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        confidence: 0,
        notes: `⏸️ Sessão ${session}: FVG muito pequeno (${(fvgSize * 100).toFixed(2)}%) - Requer >= 0.2%`,
        foundation,
        fvg,
        phase: 'SESSION_FILTER_FVG_TOO_SMALL'
      };
    }
    
    console.log(`✅ FVG size OK para sessão rigorosa: ${(fvgSize * 100).toFixed(2)}%`);
  }
  
  // ==========================================
  // PASSO 3: VALIDAÇÃO RIGOROSA DE TENDÊNCIA CONFIRMADA
  // ==========================================
  console.log(`\n📍 PASSO 3: Validando TENDÊNCIA CONFIRMADA (CRÍTICO)...`);
  const trendValidation = validateTrend(candles['1m'], fvg.direction as 'BUY' | 'SELL');
  
  if (!trendValidation.isTrending) {
    console.log(`❌ TENDÊNCIA NÃO CONFIRMADA - Operação REJEITADA`);
    console.log(`   └─ Motivo: ${trendValidation.notes}`);
    
    // Log detalhado no session_history
    await supabase.from('session_history').insert({
      user_id: userId,
      session,
      pair: asset,
      cycle_phase: 'Execution',
      event_type: 'TREND_REJECTED',
      signal: 'STAY_OUT',
      direction: fvg.direction,
      notes: `Tendência não confirmada: ${trendValidation.notes}`,
      timestamp: new Date().toISOString(),
      market_data: {
        foundation: { high: foundation.high, low: foundation.low },
        fvg: { top: fvg.fvgTop, bottom: fvg.fvgBottom, direction: fvg.direction },
        trendValidation: {
          strength: trendValidation.strength,
          consecutiveCandles: trendValidation.consecutiveCandles,
          volumeTrend: trendValidation.volumeTrend,
          priceVsMA: trendValidation.priceVsMA,
          ma10: trendValidation.ma10,
          currentPrice: trendValidation.currentPrice,
          detailedAnalysis: trendValidation.detailedAnalysis
        }
      }
    });
    
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏸️ FVG detectado mas TENDÊNCIA NÃO CONFIRMADA: ${trendValidation.notes}`,
      foundation,
      fvg,
      trendValidation,
      phase: 'TREND_NOT_CONFIRMED'
    };
  }
  
  console.log(`✅ TENDÊNCIA CONFIRMADA!`);
  console.log(`   ├─ Direção: ${trendValidation.direction}`);
  console.log(`   ├─ Força: ${trendValidation.strength.toFixed(0)}%`);
  console.log(`   ├─ Velas consecutivas: ${trendValidation.consecutiveCandles}/5`);
  console.log(`   ├─ Volume: ${trendValidation.volumeTrend}`);
  console.log(`   ├─ Preço vs MA10: ${trendValidation.priceVsMA}`);
  console.log(`   ├─ MA10: ${trendValidation.ma10.toFixed(8)}`);
  console.log(`   └─ Preço atual: ${trendValidation.currentPrice.toFixed(8)}`);
  
  // ==========================================
  // PASSO 4: VALIDAR FECHAMENTO DA 3ª VELA
  // ==========================================
  console.log(`\n📍 PASSO 4: Validando fechamento da 3ª vela do FVG...`);
  
  // TypeScript safety check
  if (!fvg.direction || !fvg.candles || fvg.candles.length < 3) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: '⏳ Erro: FVG incompleto ou sem direção definida',
      foundation,
      fvg,
      phase: 'ERROR_FVG_INCOMPLETE'
    };
  }
  
  const thirdCandle = fvg.candles[2];
  const isBullishClose = thirdCandle.close > thirdCandle.open;
  const isBearishClose = thirdCandle.close < thirdCandle.open;
  
  // Validar que a 3ª vela fechou na direção correta
  if (fvg.direction === 'BUY' && !isBullishClose) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏸️ 3ª vela não fechou bullish (Open: ${thirdCandle.open}, Close: ${thirdCandle.close})`,
      foundation,
      fvg,
      phase: 'INVALID_THIRD_CANDLE_CLOSE'
    };
  }
  
  if (fvg.direction === 'SELL' && !isBearishClose) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏸️ 3ª vela não fechou bearish (Open: ${thirdCandle.open}, Close: ${thirdCandle.close})`,
      foundation,
      fvg,
      phase: 'INVALID_THIRD_CANDLE_CLOSE'
    };
  }
  
  console.log(`✅ 3ª vela fechou ${fvg.direction === 'BUY' ? 'bullish' : 'bearish'} - Pronto para entrada!`);
  
  // ==========================================
  // PASSO 5: VALIDAÇÃO EXTRA - TAMANHO DO FVG
  // ==========================================
  console.log(`\n📍 PASSO 5: Validando tamanho do FVG...`);
  const fvgSize = (fvg.fvgTop - fvg.fvgBottom) / fvg.fvgBottom;
  const MIN_FVG_SIZE = 0.001; // 0.1% (REDUZIDO de 0.2%)
  
  console.log(`   ├─ Tamanho do FVG: ${(fvgSize * 100).toFixed(3)}% (mínimo: 0.1%)`);
  
  if (fvgSize < MIN_FVG_SIZE) {
    console.log(`   └─ ❌ FVG muito pequeno - Operação REJEITADA`);
    
    await supabase.from('session_history').insert({
      user_id: userId,
      session,
      pair: asset,
      cycle_phase: 'Execution',
      event_type: 'FVG_TOO_SMALL',
      signal: 'STAY_OUT',
      direction: fvg.direction,
      notes: `FVG muito pequeno: ${(fvgSize * 100).toFixed(3)}% (requer >= 0.1%)`,
      timestamp: new Date().toISOString(),
      market_data: {
        foundation: { high: foundation.high, low: foundation.low },
        fvg: { top: fvg.fvgTop, bottom: fvg.fvgBottom, direction: fvg.direction, size: fvgSize }
      }
    });
    
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏸️ FVG muito pequeno (${(fvgSize * 100).toFixed(3)}%) - Requer >= 0.1%`,
      foundation,
      fvg,
      trendValidation,
      phase: 'FVG_TOO_SMALL'
    };
  }
  
  console.log(`   └─ ✅ Tamanho do FVG adequado`);
  
  // ==========================================
  // PASSO 6: CALCULAR PREÇOS DE ENTRADA
  // ==========================================
  console.log(`\n📍 PASSO 6: Calculando Entry, Stop Loss e Take Profit...`);
  
  const tickSize = await getTickSize(asset);
  let entryPrice: number;
  let stopLoss: number;
  let takeProfit: number;
  let riskDistance: number;
  
  if (fvg.direction === 'BUY') {
    entryPrice = thirdCandle.close;
    stopLoss = fvg.fvgBottom;  // Stop na base do FVG
    riskDistance = entryPrice - stopLoss;
    takeProfit = entryPrice + (riskDistance * 3);  // R:R 3:1
  } else {
    entryPrice = thirdCandle.close;
    stopLoss = fvg.fvgTop;  // Stop no topo do FVG
    riskDistance = stopLoss - entryPrice;
    takeProfit = entryPrice - (riskDistance * 3);  // R:R 3:1
  }
  
  // Arredondar para tick size
  entryPrice = Math.round(entryPrice / tickSize) * tickSize;
  stopLoss = Math.round(stopLoss / tickSize) * tickSize;
  takeProfit = Math.round(takeProfit / tickSize) * tickSize;
  
  console.log(`✅ Preços calculados:`);
  console.log(`   ├─ Entry: ${entryPrice}`);
  console.log(`   ├─ Stop Loss: ${stopLoss}`);
  console.log(`   ├─ Take Profit: ${takeProfit}`);
  console.log(`   ├─ Risco: ${riskDistance.toFixed(5)}`);
  console.log(`   └─ R:R: 3:1`);
  
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
      phase: 'ERROR_INVALID_DIRECTION'
    };
  }
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 SINAL VÁLIDO - EXECUTAR TRADE IMEDIATAMENTE!`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📊 Direção: ${fvg.direction}`);
  console.log(`💰 Entry: ${entryPrice}`);
  console.log(`🛑 Stop Loss: ${stopLoss}`);
  console.log(`🎯 Take Profit: ${takeProfit}`);
  console.log(`📈 Risk/Reward: 3:1`);
  console.log(`${'='.repeat(80)}\n`);
  
  // ==========================================
  // PASSO 7: VALIDAÇÃO FINAL DE STOP LOSS DISTANCE
  // ==========================================
  const stopDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
  const MIN_STOP_DISTANCE = 0.003; // 0.3%
  
  console.log(`📍 Validando distância do Stop Loss: ${(stopDistance * 100).toFixed(2)}% (mínimo: 0.3%)`);
  
  if (stopDistance < MIN_STOP_DISTANCE) {
    console.log(`❌ Stop Loss muito próximo - Operação REJEITADA`);
    
    await supabase.from('session_history').insert({
      user_id: userId,
      session,
      pair: asset,
      cycle_phase: 'Execution',
      event_type: 'STOP_TOO_CLOSE',
      signal: 'STAY_OUT',
      direction: fvg.direction,
      notes: `Stop Loss muito próximo: ${(stopDistance * 100).toFixed(2)}% (requer >= 0.3%)`,
      timestamp: new Date().toISOString(),
      market_data: {
        foundation: { high: foundation.high, low: foundation.low },
        fvg: { top: fvg.fvgTop, bottom: fvg.fvgBottom, direction: fvg.direction },
        levels: { entry: entryPrice, stop: stopLoss, takeProfit, stopDistance }
      }
    });
    
    return {
      signal: 'STAY_OUT',
      direction: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: `⏸️ Stop Loss muito próximo (${(stopDistance * 100).toFixed(2)}%) - Requer >= 0.3%`,
      foundation,
      fvg,
      trendValidation,
      phase: 'STOP_TOO_CLOSE'
    };
  }
  
  console.log(`✅ Distância do Stop Loss adequada\n`);
  
  // ⚠️ NÃO INCREMENTAR AQUI! Incrementar somente APÓS ordem ser executada com sucesso
  // O incremento será feito em binance-order após confirmação da execução
  
  return {
    signal: fvg.direction,
    direction: fvg.direction === 'BUY' ? 'LONG' : 'SHORT',
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward: 3,  // SEMPRE 3:1
    confidence: 0.95,  // Alta confiança (estratégia mecânica)
    notes: `✅ Scalping 1Min (Mecânico): FVG ${fvg.direction} + Breakout confirmado | Entry após 3ª vela | R:R 3:1`,
    confirmation: `FVG ${fvg.direction} + Breakout + 3rd Candle Close`,
    volumeFactor: 1.0,
    c1Direction: null,
    rangeHigh: foundation.high,
    rangeLow: foundation.low,
    trendValidation, // ✅ Passar validação de tendência
    session, // ✅ Passar session para binance-order poder incrementar
    marketData: {
      foundation: { high: foundation.high, low: foundation.low },
      fvg: { top: fvg.fvgTop, bottom: fvg.fvgBottom, direction: fvg.direction, size: fvgSize },
      trend: {
        strength: trendValidation.strength,
        consecutiveCandles: trendValidation.consecutiveCandles,
        volumeTrend: trendValidation.volumeTrend,
        priceVsMA: trendValidation.priceVsMA,
        ma10: trendValidation.ma10
      },
      thirdCandle: {
        timestamp: thirdCandle.timestamp,
        open: thirdCandle.open,
        high: thirdCandle.high,
        low: thirdCandle.low,
        close: thirdCandle.close,
        volume: thirdCandle.volume,
      },
    },
    risk: {
      entry: entryPrice,
      stop: stopLoss,
      target: takeProfit,
      rr_ratio: 3,
    },
    foundation,
    fvg,
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

/**
 * Obtém o tick size para um asset específico
 */
async function getTickSize(asset: string): Promise<number> {
  const tickSizes: { [key: string]: number } = {
    'BTCUSDT': 0.1,
    'ETHUSDT': 0.01,
    'BNBUSDT': 0.01,
    'SOLUSDT': 0.001,
    'XRPUSDT': 0.0001,
    'ADAUSDT': 0.0001,
    'DOGEUSDT': 0.00001,
    'DOTUSDT': 0.001,
    'MATICUSDT': 0.0001,
    'SHIBUSDT': 0.00000001,
    'AVAXUSDT': 0.001,
    'LINKUSDT': 0.001,
    'UNIUSDT': 0.001,
    'ATOMUSDT': 0.001,
    'LTCUSDT': 0.01,
    'NEARUSDT': 0.001,
    'ALGOUSDT': 0.0001,
    'VETUSDT': 0.00001,
    'ICPUSDT': 0.001,
    'FILUSDT': 0.001,
    'TRXUSDT': 0.00001,
    'ETCUSDT': 0.001,
    'XLMUSDT': 0.00001,
    'MANAUSDT': 0.0001,
    'SANDUSDT': 0.0001,
    'THETAUSDT': 0.0001,
    'AXSUSDT': 0.001,
    'AAVEUSDT': 0.01,
    'EOSUSDT': 0.0001,
    'XTZUSDT': 0.0001,
    'FTMUSDT': 0.0001,
    'HBARUSDT': 0.00001,
    'EGLDUSDT': 0.001,
    'KSMUSDT': 0.001,
    'RUNEUSDT': 0.001,
    '1000PEPEUSDT': 0.0000001,
    'ORDIUSDT': 0.001,
    'INJUSDT': 0.001,
    'STXUSDT': 0.0001,
    'TIAUSDT': 0.0001,
    'SEIUSDT': 0.0001,
    'ZENUSDT': 0.001,
    'DASHUSDT': 0.01,
    'ZECUSDT': 0.01,
    'BCHUSDT': 0.01,
    'ASTERUSDT': 0.00001,
    'ALCHUSDT': 0.0001,
    'FFUSDT': 0.0001,
    'AIAUSDT': 0.0001,
    'HIPPOUSDT': 0.00001,
    'ZKUSDT': 0.0001,
    'METUSDT': 0.0001,
    'STRKUSDT': 0.0001,
    'BANKUSDT': 0.00001,
    'BEATUSDT': 0.00001,
    'WLFIUSDT': 0.0001,
    'PENGUUSDT': 0.00001,
    'PUMPUSDT': 0.00001,
    'BDXNUSDT': 0.0001,
    'ENAUSDT': 0.0001,
    'FARTCOINUSDT': 0.0001,
    'FOLKSUSDT': 0.0001,
    'TRUTHUSDT': 0.00001,
    '0GUSDT': 0.0001,
  };
  
  return tickSizes[asset] || 0.001;  // Default: 0.001 se não encontrado
}
