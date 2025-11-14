// ============================================
// FIRST CANDLE RULE - RETEST DETECTION
// ============================================
// Detecta reteste do nível rompido (First 5-min High ou Low)

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface RetestResult {
  hasRetest: boolean;
  retestCandle: Candle | null;
  retestPrice: number;
}

/**
 * Detecta reteste do nível rompido usando velas de 1 minuto
 * Reteste = preço volta a tocar a zona rompida
 */
export async function detectRetest(
  candles1m: Candle[],
  breakoutPrice: number,
  direction: 'BUY' | 'SELL',
  breakoutCandleTimestamp: number
): Promise<RetestResult> {
  if (!candles1m || candles1m.length === 0) {
    return {
      hasRetest: false,
      retestCandle: null,
      retestPrice: 0,
    };
  }
  
  // Apenas velas APÓS o breakout
  const candlesAfterBreakout = candles1m.filter(
    candle => candle.timestamp > breakoutCandleTimestamp
  );
  
  if (candlesAfterBreakout.length === 0) {
    return {
      hasRetest: false,
      retestCandle: null,
      retestPrice: 0,
    };
  }
  
  // Tolerância para o reteste (0.1% do preço)
  const tolerance = breakoutPrice * 0.001;
  
  for (const candle of candlesAfterBreakout) {
    let hasRetestTouch = false;
    
    if (direction === 'BUY') {
      // Para BUY: reteste toca o nível de BAIXO (low da vela toca ou fica próximo do breakoutPrice)
      if (Math.abs(candle.low - breakoutPrice) <= tolerance || 
          (candle.low <= breakoutPrice && candle.close >= breakoutPrice)) {
        hasRetestTouch = true;
      }
    } else if (direction === 'SELL') {
      // Para SELL: reteste toca o nível de CIMA (high da vela toca ou fica próximo do breakoutPrice)
      if (Math.abs(candle.high - breakoutPrice) <= tolerance ||
          (candle.high >= breakoutPrice && candle.close <= breakoutPrice)) {
        hasRetestTouch = true;
      }
    }
    
    if (hasRetestTouch) {
      console.log(`✅ RETEST DETECTADO (${direction}):`);
      console.log(`   Breakout Price: ${breakoutPrice}`);
      console.log(`   Retest Candle Low: ${candle.low}`);
      console.log(`   Retest Candle High: ${candle.high}`);
      console.log(`   Retest Candle Close: ${candle.close}`);
      console.log(`   Time: ${new Date(candle.timestamp).toISOString()}`);
      
      return {
        hasRetest: true,
        retestCandle: candle,
        retestPrice: direction === 'BUY' ? candle.low : candle.high,
      };
    }
  }
  
  return {
    hasRetest: false,
    retestCandle: null,
    retestPrice: 0,
  };
}

/**
 * Verifica se o reteste é válido (não foi falso ou muito distante)
 */
export function isValidRetest(
  retestCandle: Candle,
  breakoutPrice: number,
  direction: 'BUY' | 'SELL'
): boolean {
  const maxDeviation = breakoutPrice * 0.002; // Máximo 0.2% de desvio
  
  if (direction === 'BUY') {
    const distance = Math.abs(retestCandle.low - breakoutPrice);
    return distance <= maxDeviation;
  } else {
    const distance = Math.abs(retestCandle.high - breakoutPrice);
    return distance <= maxDeviation;
  }
}
