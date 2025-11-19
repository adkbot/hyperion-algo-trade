/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAVA DE SEGURANÇA UNIVERSAL - RR 1:1
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Protege lucros quando posição atinge RR 1:1
 * Monitora fraqueza na zona 1.0-1.5 RR
 * Aplica-se a TODOS os sistemas: ADK, SCALPING, SWEEP
 * 
 * REGRAS:
 * - RR < 1.0: Manter posição
 * - RR 1.0-1.5: ZONA DE PROTEÇÃO - monitorar fraqueza
 * - RR > 1.5: Deixar correr até meta 3:1
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface ActivePosition {
  id: string;
  asset: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  risk_reward: number;
  current_price?: number;
}

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ContinuityAnalysis {
  continuing: boolean;
  strongCandles: number;
  weakCandles: number;
  avgBodySize: number;
  directionConfirmed: boolean;
}

interface WeaknessAnalysis {
  hasWeakness: boolean;
  consecutiveDojis: number;
  hasReversal: boolean;
  volumeDecreasing: boolean;
  oppositeMomentum: boolean;
}

export interface ClosureDecision {
  shouldClose: boolean;
  reason: string;
  currentRR: number;
  confidence: number;
  continuity?: ContinuityAnalysis;
  weakness?: WeaknessAnalysis;
}

/**
 * Calcula RR atual da posição
 */
export function calculateCurrentRR(position: ActivePosition): number {
  if (!position.current_price) return 0;
  
  const risk = Math.abs(position.entry_price - position.stop_loss);
  const currentProfit = position.direction === 'BUY'
    ? position.current_price - position.entry_price
    : position.entry_price - position.current_price;
  
  return risk > 0 ? currentProfit / risk : 0;
}

/**
 * Busca velas recentes da Binance
 */
async function fetchRecentCandles(asset: string, limit: number = 10): Promise<Candle[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${asset}&interval=1m&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return data.map((k: any) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (error) {
    console.error(`❌ Erro ao buscar candles de ${asset}:`, error);
    return [];
  }
}

/**
 * Analisa continuidade do movimento
 */
function analyzeContinuity(candles: Candle[], direction: 'BUY' | 'SELL'): ContinuityAnalysis {
  if (candles.length < 5) {
    return {
      continuing: false,
      strongCandles: 0,
      weakCandles: 0,
      avgBodySize: 0,
      directionConfirmed: false
    };
  }
  
  const recentCandles = candles.slice(-5);
  let strongCandles = 0;
  let weakCandles = 0;
  let bodySizes: number[] = [];
  
  recentCandles.forEach(candle => {
    const bodySize = Math.abs(candle.close - candle.open);
    const candleRange = candle.high - candle.low;
    const bodyRatio = candleRange > 0 ? bodySize / candleRange : 0;
    
    bodySizes.push(bodySize);
    
    const isBullish = candle.close > candle.open;
    const isBearish = candle.close < candle.open;
    
    // Vela forte na direção esperada
    if (direction === 'BUY' && isBullish && bodyRatio > 0.6) {
      strongCandles++;
    } else if (direction === 'SELL' && isBearish && bodyRatio > 0.6) {
      strongCandles++;
    }
    // Vela fraca ou contra a direção
    else if (bodyRatio < 0.3 || 
             (direction === 'BUY' && isBearish) || 
             (direction === 'SELL' && isBullish)) {
      weakCandles++;
    }
  });
  
  const avgBodySize = bodySizes.reduce((a, b) => a + b, 0) / bodySizes.length;
  
  // Continuidade confirmada: 3+ velas fortes e poucas fracas
  const continuing = strongCandles >= 3 && weakCandles <= 1;
  const directionConfirmed = strongCandles > weakCandles;
  
  return {
    continuing,
    strongCandles,
    weakCandles,
    avgBodySize,
    directionConfirmed
  };
}

/**
 * Analisa sinais de fraqueza
 */
function analyzeWeakness(candles: Candle[], direction: 'BUY' | 'SELL'): WeaknessAnalysis {
  if (candles.length < 5) {
    return {
      hasWeakness: false,
      consecutiveDojis: 0,
      hasReversal: false,
      volumeDecreasing: false,
      oppositeMomentum: false
    };
  }
  
  const recentCandles = candles.slice(-5);
  let consecutiveDojis = 0;
  let maxConsecutiveDojis = 0;
  let reversalCount = 0;
  
  // Calcular média de volume
  const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
  const lastTwoVolume = (recentCandles[3].volume + recentCandles[4].volume) / 2;
  const volumeDecreasing = lastTwoVolume < avgVolume * 0.7;
  
  // Detectar dojis consecutivos e reversões
  recentCandles.forEach((candle, i) => {
    const bodySize = Math.abs(candle.close - candle.open);
    const candleRange = candle.high - candle.low;
    const bodyRatio = candleRange > 0 ? bodySize / candleRange : 0;
    
    // Doji (corpo < 30% do range)
    if (bodyRatio < 0.3) {
      consecutiveDojis++;
      maxConsecutiveDojis = Math.max(maxConsecutiveDojis, consecutiveDojis);
    } else {
      consecutiveDojis = 0;
    }
    
    // Vela de reversão
    const isBullish = candle.close > candle.open;
    const isBearish = candle.close < candle.open;
    
    if ((direction === 'BUY' && isBearish && bodyRatio > 0.6) ||
        (direction === 'SELL' && isBullish && bodyRatio > 0.6)) {
      reversalCount++;
    }
  });
  
  // Momentum oposto: 2+ velas fortes contra a direção
  const oppositeMomentum = reversalCount >= 2;
  
  // Reversão: 1 vela muito forte contra
  const hasReversal = reversalCount >= 1;
  
  const hasWeakness = maxConsecutiveDojis >= 2 || volumeDecreasing || oppositeMomentum;
  
  return {
    hasWeakness,
    consecutiveDojis: maxConsecutiveDojis,
    hasReversal,
    volumeDecreasing,
    oppositeMomentum
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FUNÇÃO PRINCIPAL: VERIFICAR SE DEVE FECHAR POSIÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function shouldClosePosition(position: ActivePosition): Promise<ClosureDecision> {
  
  console.log(`\n🔍 Verificando proteção de posição ${position.id} (${position.asset})`);
  
  // Calcular RR atual
  const currentRR = calculateCurrentRR(position);
  
  console.log(`   RR Atual: ${currentRR.toFixed(2)}:1`);
  console.log(`   Direção: ${position.direction}`);
  
  // Ainda não atingiu RR 1:1 - manter posição
  if (currentRR < 1.0) {
    // ✅ FASE 4: Log resumido fora da zona
    console.log(`   └─ 🟡 ${position.asset}: RR ${currentRR.toFixed(2)}:1 - Abaixo de 1:1, aguardando breakeven\n`);
    return {
      shouldClose: false,
      reason: 'RR ainda abaixo de 1:1 - aguardando',
      currentRR,
      confidence: 0.5
    };
  }
  
  // ✅ FASE 2: ZONA DE PROTEÇÃO EXPANDIDA (1.0-1.8 RR = 60% do caminho)
  // Já passou da zona de proteção - deixar correr até meta
  if (currentRR > 1.8) {
    // ✅ FASE 4: Log resumido fora da zona
    console.log(`   └─ 🚀 ${position.asset}: RR ${currentRR.toFixed(2)}:1 - Acima de 1.8, deixar correr até meta (3:1)\n`);
    return {
      shouldClose: false,
      reason: 'RR acima de 1.8:1 - mantendo até meta 3:1',
      currentRR,
      confidence: 0.9
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // ZONA DE PROTEÇÃO: 1.0 - 1.8 RR (60% do caminho até meta 3:1)
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`\n🔍 ZONA DE PROTEÇÃO - Analisando ${position.asset}`);
  console.log(`   RR Atual: ${currentRR.toFixed(2)}:1`);
  console.log(`   ⚠️ Zona 1.0-1.8 RR - Monitoramento de momentum...\n`);
  
  // Buscar candles recentes
  const candles = await fetchRecentCandles(position.asset, 10);
  
  if (candles.length < 5) {
    console.log(`   └─ ⚠️ Candles insuficientes - mantendo por segurança\n`);
    return {
      shouldClose: false,
      reason: 'Dados insuficientes na zona de proteção',
      currentRR,
      confidence: 0.3
    };
  }
  
  // Analisar continuidade e fraqueza
  const continuity = analyzeContinuity(candles, position.direction);
  const weakness = analyzeWeakness(candles, position.direction);
  
  // ✅ FASE 4: Logs condicionais - só detalhados na zona de proteção
  console.log(`   📊 Continuidade:`);
  console.log(`      ├─ Velas fortes: ${continuity.strongCandles}/5`);
  console.log(`      ├─ Velas fracas: ${continuity.weakCandles}/5`);
  console.log(`      └─ Direção confirmada: ${continuity.directionConfirmed ? 'SIM' : 'NÃO'}`);
  
  console.log(`   ⚠️ Fraqueza:`);
  console.log(`      ├─ Dojis consecutivos: ${weakness.consecutiveDojis}`);
  console.log(`      ├─ Volume decrescente: ${weakness.volumeDecreasing ? 'SIM' : 'NÃO'}`);
  console.log(`      ├─ Momentum oposto: ${weakness.oppositeMomentum ? 'SIM' : 'NÃO'}`);
  console.log(`      └─ Reversão detectada: ${weakness.hasReversal ? 'SIM' : 'NÃO'}\n`);
  
  // DECISÃO: Fechar se houver fraqueza significativa
  if (weakness.hasWeakness || !continuity.continuing) {
    console.log(`   🔴 FECHAR POSIÇÃO - Fraqueza detectada na zona de proteção\n`);
    return {
      shouldClose: true,
      reason: `Proteção RR 1:1 ativada - ${weakness.oppositeMomentum ? 'momentum reverso' : weakness.volumeDecreasing ? 'volume decrescente' : 'dojis consecutivos'}`,
      currentRR,
      confidence: 0.75,
      continuity,
      weakness
    };
  }
  
  // Continuidade forte - manter até meta
  console.log(`   ✅ MANTER POSIÇÃO - Momentum continua forte\n`);
  
  return {
    shouldClose: false,
    reason: 'Momentum forte na zona de proteção - aguardando meta 3:1',
    currentRR,
    confidence: 0.7,
    continuity,
    weakness
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRAILING STOP DINÂMICO
 * ═══════════════════════════════════════════════════════════════════════════
 * Move stop loss para proteger lucros conforme posição evolui
 * - RR 1:1 → Move SL para breakeven
 * - RR 2:1 → Protege 50% do lucro
 */
export async function adjustStopLossDynamic(
  position: ActivePosition,
  currentPrice: number,
  supabase: any
): Promise<{ newStopLoss: number; action: string } | null> {
  const currentRR = calculateCurrentRR({ ...position, current_price: currentPrice });
  
  // Breakeven em RR 1:1
  if (currentRR >= 1.0 && currentRR < 1.5) {
    const breakEvenSL = position.entry_price;
    if (position.direction === 'BUY' && breakEvenSL > position.stop_loss) {
      console.log(`🔒 BREAKEVEN atingido em RR ${currentRR.toFixed(2)} - Movendo SL para ${breakEvenSL}`);
      return { newStopLoss: breakEvenSL, action: 'BREAKEVEN' };
    } else if (position.direction === 'SELL' && breakEvenSL < position.stop_loss) {
      console.log(`🔒 BREAKEVEN atingido em RR ${currentRR.toFixed(2)} - Movendo SL para ${breakEvenSL}`);
      return { newStopLoss: breakEvenSL, action: 'BREAKEVEN' };
    }
  }
  
  // Proteção de 50% do lucro em RR 2:1
  if (currentRR >= 2.0) {
    const risk = Math.abs(position.entry_price - position.stop_loss);
    const halfProfit = risk; // RR 1:1
    const protectedSL = position.direction === 'BUY' 
      ? position.entry_price + halfProfit
      : position.entry_price - halfProfit;
    
    if (position.direction === 'BUY' && protectedSL > position.stop_loss) {
      console.log(`💎 RR 2:1 atingido - Protegendo 50% do lucro (novo SL: ${protectedSL})`);
      return { newStopLoss: protectedSL, action: 'PROTECT_50%' };
    } else if (position.direction === 'SELL' && protectedSL < position.stop_loss) {
      console.log(`💎 RR 2:1 atingido - Protegendo 50% do lucro (novo SL: ${protectedSL})`);
      return { newStopLoss: protectedSL, action: 'PROTECT_50%' };
    }
  }
  
  return null;
}
