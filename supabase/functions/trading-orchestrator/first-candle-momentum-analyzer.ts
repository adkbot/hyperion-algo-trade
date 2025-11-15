/**
 * MÓDULO DE ANÁLISE DE MOMENTUM - FIRST CANDLE RULE
 * 
 * Monitora posições ativas da estratégia First Candle Rule e decide:
 * - Se deve proteger lucro (fechar antecipadamente entre R:R 1.0-1.5)
 * - Se deve deixar correr (acima R:R 1.5)
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ActivePosition {
  id: string;
  asset: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  current_price: number;
  opened_at: string;
}

interface ContinuityAnalysis {
  confirmed: boolean;
  strongCandles: number;
  rejections: number;
  volumeIncrease: boolean;
}

interface WeaknessAnalysis {
  detected: boolean;
  counterTrendCandles: number;
  insideBars: number;
  largeWicks: number;
  stalling: boolean;
}

interface ClosureDecision {
  shouldClose: boolean;
  reason: string;
  currentRR: number;
}

/**
 * Calcula o R:R atual da posição
 */
export function calculateCurrentRR(position: ActivePosition): number {
  const { direction, entry_price, stop_loss, current_price } = position;
  
  const risk = Math.abs(entry_price - stop_loss);
  
  if (direction === 'BUY') {
    const profit = current_price - entry_price;
    return profit / risk;
  } else {
    const profit = entry_price - current_price;
    return profit / risk;
  }
}

/**
 * Busca velas recentes da Binance
 */
async function fetchRecentCandles(asset: string, limit: number = 10): Promise<Candle[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${asset}&interval=1m&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Erro ao buscar candles: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    return data.map((k: any) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }));
  } catch (error) {
    console.error(`❌ Erro ao buscar candles de ${asset}:`, error);
    return [];
  }
}

/**
 * Analisa se o momentum está continuando (forte a favor da posição)
 */
export function analyzeContinuity(candles: Candle[], direction: 'BUY' | 'SELL'): ContinuityAnalysis {
  const last5 = candles.slice(-5);
  
  let strongCandles = 0;
  let rejections = 0;
  
  for (const candle of last5) {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    const bodyRatio = bodySize / totalRange;
    
    // Vela forte: corpo > 60% do range total
    const isStrongCandle = bodyRatio > 0.6;
    
    if (direction === 'BUY') {
      // Bullish: close > open
      if (candle.close > candle.open && isStrongCandle) {
        strongCandles++;
      }
      // Rejeição de baixa: long wick inferior
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      if (lowerWick > bodySize * 1.5) {
        rejections++;
      }
    } else {
      // Bearish: close < open
      if (candle.close < candle.open && isStrongCandle) {
        strongCandles++;
      }
      // Rejeição de alta: long wick superior
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      if (upperWick > bodySize * 1.5) {
        rejections++;
      }
    }
  }
  
  // Verificar aumento de volume
  const avgVolume = last5.slice(0, 3).reduce((sum, c) => sum + c.volume, 0) / 3;
  const recentVolume = last5.slice(-2).reduce((sum, c) => sum + c.volume, 0) / 2;
  const volumeIncrease = recentVolume > avgVolume * 1.2;
  
  const confirmed = strongCandles >= 3 || (strongCandles >= 2 && rejections >= 2 && volumeIncrease);
  
  console.log(`   📊 Continuidade:`);
  console.log(`      ├─ Velas fortes: ${strongCandles}/5`);
  console.log(`      ├─ Rejeições: ${rejections}`);
  console.log(`      ├─ Volume aumentando: ${volumeIncrease ? 'SIM' : 'NÃO'}`);
  console.log(`      └─ Confirmado: ${confirmed ? '✅ SIM' : '❌ NÃO'}`);
  
  return {
    confirmed,
    strongCandles,
    rejections,
    volumeIncrease,
  };
}

/**
 * Analisa sinais de fraqueza (momentum perdendo força)
 */
export function analyzeWeakness(candles: Candle[], direction: 'BUY' | 'SELL'): WeaknessAnalysis {
  const last5 = candles.slice(-5);
  
  let counterTrendCandles = 0;
  let insideBars = 0;
  let largeWicks = 0;
  let stalling = true;
  
  for (let i = 0; i < last5.length; i++) {
    const candle = last5[i];
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    
    // Vela contra-tendência
    if (direction === 'BUY' && candle.close < candle.open) {
      counterTrendCandles++;
    } else if (direction === 'SELL' && candle.close > candle.open) {
      counterTrendCandles++;
    }
    
    // Inside bar (range menor que vela anterior)
    if (i > 0) {
      const prevRange = last5[i - 1].high - last5[i - 1].low;
      if (totalRange < prevRange * 0.8) {
        insideBars++;
      }
    }
    
    // Large wick (pavio > 2x corpo)
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const maxWick = Math.max(upperWick, lowerWick);
    
    if (maxWick > bodySize * 2) {
      largeWicks++;
    }
  }
  
  // Verificar se preço está estagnado (range das últimas 3 velas < 0.3% do preço)
  const last3 = last5.slice(-3);
  const highestHigh = Math.max(...last3.map(c => c.high));
  const lowestLow = Math.min(...last3.map(c => c.low));
  const priceMovement = ((highestHigh - lowestLow) / lowestLow) * 100;
  
  stalling = priceMovement < 0.3;
  
  const detected = counterTrendCandles >= 3 || insideBars >= 2 || largeWicks >= 2 || stalling;
  
  console.log(`   📉 Fraqueza:`);
  console.log(`      ├─ Velas contra-tendência: ${counterTrendCandles}/5`);
  console.log(`      ├─ Inside bars: ${insideBars}`);
  console.log(`      ├─ Large wicks: ${largeWicks}`);
  console.log(`      ├─ Estagnação: ${stalling ? 'SIM' : 'NÃO'} (${priceMovement.toFixed(2)}%)`);
  console.log(`      └─ Detectada: ${detected ? '⚠️ SIM' : '✅ NÃO'}`);
  
  return {
    detected,
    counterTrendCandles,
    insideBars,
    largeWicks,
    stalling,
  };
}

/**
 * Decide se deve fechar a posição baseado no R:R e análise de momentum
 */
export async function shouldClosePosition(position: ActivePosition): Promise<ClosureDecision> {
  const currentRR = calculateCurrentRR(position);
  
  console.log(`\n🔍 Analisando posição ${position.asset} (${position.direction}):`);
  console.log(`   ├─ R:R Atual: ${currentRR.toFixed(2)}`);
  console.log(`   ├─ Entry: ${position.entry_price}`);
  console.log(`   ├─ Current: ${position.current_price}`);
  console.log(`   └─ Target: ${position.take_profit}`);
  
  // Se ainda não atingiu R:R 1:1, não fazer nada
  if (currentRR < 1.0) {
    return {
      shouldClose: false,
      reason: 'R:R ainda abaixo de 1:1 - aguardando',
      currentRR,
    };
  }
  
  // Se já passou de R:R 1.5, deixar correr até alvo
  if (currentRR >= 1.5) {
    return {
      shouldClose: false,
      reason: 'R:R acima de 1.5 - deixando correr até alvo 3:1',
      currentRR,
    };
  }
  
  // ZONA DE PROTEÇÃO: entre R:R 1.0 e 1.5
  console.log(`\n⚡ ZONA DE PROTEÇÃO (1.0 - 1.5) - Analisando momentum...`);
  
  const candles = await fetchRecentCandles(position.asset, 10);
  
  if (candles.length === 0) {
    console.log(`⚠️ Não foi possível buscar candles - mantendo posição`);
    return {
      shouldClose: false,
      reason: 'Dados insuficientes para análise',
      currentRR,
    };
  }
  
  const continuity = analyzeContinuity(candles, position.direction);
  const weakness = analyzeWeakness(candles, position.direction);
  
  // Decisão: Fechar se detectar fraqueza
  if (weakness.detected) {
    return {
      shouldClose: true,
      reason: `Fraqueza detectada na zona de proteção (R:R ${currentRR.toFixed(2)})`,
      currentRR,
    };
  }
  
  // Manter se confirmou continuidade
  if (continuity.confirmed) {
    return {
      shouldClose: false,
      reason: `Continuidade confirmada - mantendo posição (R:R ${currentRR.toFixed(2)})`,
      currentRR,
    };
  }
  
  // Indeciso: fechar por segurança (proteger lucro)
  return {
    shouldClose: true,
    reason: `Momentum indefinido - protegendo lucro (R:R ${currentRR.toFixed(2)})`,
    currentRR,
  };
}
