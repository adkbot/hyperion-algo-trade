// ============================================
// CONFIRMAÇÃO 1M - FVG + SWEEP
// ============================================
// Última etapa: detectar sweep + FVG em 1m na mesma direção do 15m

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Confirmation1mResult {
  confirmed: boolean;
  sweepDetected: boolean;
  fvgDetected: boolean;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  notes: string;
}

/**
 * Confirma entrada em 1m através de:
 * 1. Minor sweep (toque em high/low local)
 * 2. FVG 1m na mesma direção do 15m
 */
export function detect1mConfirmation(
  candles1m: Candle[],
  direction: 'BUY' | 'SELL' | null,
  fvg15mMidpoint: number,
  fvg15mTop: number,
  fvg15mBottom: number
): Confirmation1mResult {
  
  console.log('\n🔍 Buscando confirmação em 1m...');
  console.log(`   Direção esperada: ${direction}`);
  
  if (!candles1m || candles1m.length < 20) {
    return createEmptyResult('Candles 1m insuficientes');
  }
  
  // Últimas 20 velas de 1m
  const recentCandles = candles1m.slice(-20);
  
  // 1️⃣ Detectar sweep em 1m
  const sweep = detectMinorSweep(recentCandles, direction);
  
  if (!sweep.detected) {
    return createEmptyResult('Aguardando sweep em 1m');
  }
  
  console.log(`✅ Sweep 1m detectado em $${sweep.price}`);
  
  // 2️⃣ Detectar FVG em 1m APÓS o sweep
  const candlesAfterSweep = recentCandles.filter(c => c.timestamp > sweep.timestamp);
  
  if (candlesAfterSweep.length < 3) {
    return createEmptyResult('Aguardando formação de FVG 1m após sweep');
  }
  
  const fvg1m = detectFVG1m(candlesAfterSweep, direction);
  
  if (!fvg1m.detected) {
    return createEmptyResult('Aguardando FVG 1m na direção correta');
  }
  
  console.log(`✅ FVG 1m detectado! Zone: $${fvg1m.bottom} - $${fvg1m.top}`);
  
  // 3️⃣ Calcular entry, stop e target
  const risk = calculateRiskLevels(
    direction!,
    fvg1m.entryPrice,
    fvg15mTop,
    fvg15mBottom
  );
  
  console.log(`📊 Níveis de risco calculados:`);
  console.log(`   Entry: $${risk.entryPrice}`);
  console.log(`   Stop: $${risk.stopLoss}`);
  console.log(`   Target: $${risk.takeProfit}`);
  console.log(`   R:R: ${risk.riskReward}:1`);
  
  return {
    confirmed: true,
    sweepDetected: true,
    fvgDetected: true,
    entryPrice: risk.entryPrice,
    stopLoss: risk.stopLoss,
    takeProfit: risk.takeProfit,
    riskReward: risk.riskReward,
    notes: `✅ ADK confirmado: Sweep 1m + FVG 1m (${direction})`
  };
}

/**
 * Detecta minor sweep em 1m (toque em local high/low com reversão)
 */
function detectMinorSweep(
  candles: Candle[],
  direction: 'BUY' | 'SELL' | null
): { detected: boolean; price: number; timestamp: number } {
  
  if (!direction || candles.length < 5) {
    return { detected: false, price: 0, timestamp: 0 };
  }
  
  // Procurar últimas 10 velas
  const recent = candles.slice(-10);
  
  for (let i = 2; i < recent.length - 2; i++) {
    const candle = recent[i];
    const prevCandles = recent.slice(i - 2, i);
    const nextCandles = recent.slice(i + 1, i + 3);
    
    if (direction === 'BUY') {
      // Para compra: procurar low local que foi tocado e reverteu pra cima
      const isLocalLow = prevCandles.every(c => c.low > candle.low) &&
                         nextCandles.every(c => c.low > candle.low);
      
      const hasReversal = nextCandles.some(c => c.close > candle.high);
      
      if (isLocalLow && hasReversal) {
        return {
          detected: true,
          price: candle.low,
          timestamp: candle.timestamp
        };
      }
    } else {
      // Para venda: procurar high local que foi tocado e reverteu pra baixo
      const isLocalHigh = prevCandles.every(c => c.high < candle.high) &&
                          nextCandles.every(c => c.high < candle.high);
      
      const hasReversal = nextCandles.some(c => c.close < candle.low);
      
      if (isLocalHigh && hasReversal) {
        return {
          detected: true,
          price: candle.high,
          timestamp: candle.timestamp
        };
      }
    }
  }
  
  return { detected: false, price: 0, timestamp: 0 };
}

/**
 * Detecta FVG em 1m na direção especificada
 */
function detectFVG1m(
  candles: Candle[],
  direction: 'BUY' | 'SELL' | null
): { detected: boolean; top: number; bottom: number; entryPrice: number } {
  
  if (!direction || candles.length < 3) {
    return { detected: false, top: 0, bottom: 0, entryPrice: 0 };
  }
  
  // Procurar padrão FVG nas últimas velas
  for (let i = 0; i < candles.length - 2; i++) {
    const c1 = candles[i];
    const c2 = candles[i + 1];
    const c3 = candles[i + 2];
    
    if (direction === 'BUY') {
      // Bullish FVG: low da c3 > high da c1
      if (c3.low > c1.high) {
        const top = c3.low;
        const bottom = c1.high;
        const entryPrice = (top + bottom) / 2; // 50% do FVG
        
        return { detected: true, top, bottom, entryPrice };
      }
    } else {
      // Bearish FVG: high da c3 < low da c1
      if (c3.high < c1.low) {
        const top = c1.low;
        const bottom = c3.high;
        const entryPrice = (top + bottom) / 2; // 50% do FVG
        
        return { detected: true, top, bottom, entryPrice };
      }
    }
  }
  
  return { detected: false, top: 0, bottom: 0, entryPrice: 0 };
}

/**
 * Calcula níveis de risco (entry, stop, target)
 */
function calculateRiskLevels(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  fvg15mTop: number,
  fvg15mBottom: number
): {
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
} {
  
  let stopLoss: number;
  let takeProfit: number;
  
  if (direction === 'BUY') {
    // Stop abaixo do FVG 15m bottom
    stopLoss = fvg15mBottom * 0.998; // 0.2% abaixo
    
    // Target: 2:1 ou 3:1
    const risk = entryPrice - stopLoss;
    takeProfit = entryPrice + (risk * 2.5); // R:R 2.5:1
  } else {
    // Stop acima do FVG 15m top
    stopLoss = fvg15mTop * 1.002; // 0.2% acima
    
    // Target: 2:1 ou 3:1
    const risk = stopLoss - entryPrice;
    takeProfit = entryPrice - (risk * 2.5); // R:R 2.5:1
  }
  
  const riskAmount = Math.abs(entryPrice - stopLoss);
  const rewardAmount = Math.abs(takeProfit - entryPrice);
  const riskReward = rewardAmount / riskAmount;
  
  return {
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward
  };
}

/**
 * Cria resultado vazio
 */
function createEmptyResult(notes: string): Confirmation1mResult {
  return {
    confirmed: false,
    sweepDetected: false,
    fvgDetected: false,
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    riskReward: 0,
    notes
  };
}
