// ============================================
// FIRST CANDLE RULE - BREAKOUT DETECTION
// ============================================
// Detecta rompimento do First 5-min High ou Low no gráfico de 1 minuto

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface BreakoutResult {
  hasBreakout: boolean;
  direction: 'BUY' | 'SELL' | null;
  breakoutCandle: Candle | null;
  breakoutPrice: number;
}

/**
 * Detecta rompimento do First 5-min High/Low usando velas de 1 minuto
 */
export async function detectBreakout(
  candles1m: Candle[],
  firstCandleHigh: number,
  firstCandleLow: number
): Promise<BreakoutResult> {
  if (!candles1m || candles1m.length < 2) {
    return {
      hasBreakout: false,
      direction: null,
      breakoutCandle: null,
      breakoutPrice: 0,
    };
  }
  
  // Percorrer velas de 1 min mais recentes (últimas 60 velas = 1 hora)
  const recentCandles = candles1m.slice(-60);
  
  for (let i = 0; i < recentCandles.length; i++) {
    const candle = recentCandles[i];
    
    // Verificar rompimento do HIGH (sinal de COMPRA)
    if (candle.close > firstCandleHigh && candle.high > firstCandleHigh) {
      console.log(`🔺 BREAKOUT DETECTADO (BUY):`);
      console.log(`   First 5-min High: ${firstCandleHigh}`);
      console.log(`   Candle Close: ${candle.close}`);
      console.log(`   Candle High: ${candle.high}`);
      console.log(`   Time: ${new Date(candle.timestamp).toISOString()}`);
      
      return {
        hasBreakout: true,
        direction: 'BUY',
        breakoutCandle: candle,
        breakoutPrice: firstCandleHigh,
      };
    }
    
    // Verificar rompimento do LOW (sinal de VENDA)
    if (candle.close < firstCandleLow && candle.low < firstCandleLow) {
      console.log(`🔻 BREAKOUT DETECTADO (SELL):`);
      console.log(`   First 5-min Low: ${firstCandleLow}`);
      console.log(`   Candle Close: ${candle.close}`);
      console.log(`   Candle Low: ${candle.low}`);
      console.log(`   Time: ${new Date(candle.timestamp).toISOString()}`);
      
      return {
        hasBreakout: true,
        direction: 'SELL',
        breakoutCandle: candle,
        breakoutPrice: firstCandleLow,
      };
    }
  }
  
  return {
    hasBreakout: false,
    direction: null,
    breakoutCandle: null,
    breakoutPrice: 0,
  };
}

/**
 * Verifica se já houve um breakout anterior (para evitar múltiplas detecções)
 */
export function hasRecentBreakout(
  candles1m: Candle[],
  firstCandleHigh: number,
  firstCandleLow: number,
  lookbackMinutes: number = 30
): boolean {
  if (!candles1m || candles1m.length === 0) return false;
  
  const recentCandles = candles1m.slice(-lookbackMinutes);
  
  for (const candle of recentCandles) {
    if (candle.high > firstCandleHigh || candle.low < firstCandleLow) {
      return true;
    }
  }
  
  return false;
}
