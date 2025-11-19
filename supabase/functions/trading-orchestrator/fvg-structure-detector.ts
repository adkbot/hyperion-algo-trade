// ============================================
// STRUCTURE DETECTOR - BOS & MSS Detection
// ============================================
// Detecta Break of Structure (BOS) e Market Structure Shift (MSS)

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SwingPoint {
  type: 'HIGH' | 'LOW';
  price: number;
  timestamp: number;
  index: number;
}

export interface BOSResult {
  detected: boolean;
  direction: 'BULLISH' | 'BEARISH' | null;
  breakPrice: number;
  swingPoint: SwingPoint | null;
  timestamp: number;
}

export interface MSSResult {
  detected: boolean;
  direction: 'BULLISH_TO_BEARISH' | 'BEARISH_TO_BULLISH' | null;
  breakPrice: number;
  swingPoint: SwingPoint | null;
  timestamp: number;
}

/**
 * Identifica swing highs e swing lows em um array de candles
 */
export function findSwingPoints(candles: Candle[], lookback: number = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];
  
  if (!candles || candles.length < lookback * 2 + 1) {
    return swings;
  }
  
  for (let i = lookback; i < candles.length - lookback; i++) {
    const currentHigh = candles[i].high;
    const currentLow = candles[i].low;
    
    // Check for Swing High
    let isSwingHigh = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].high >= currentHigh) {
        isSwingHigh = false;
        break;
      }
    }
    
    if (isSwingHigh) {
      swings.push({
        type: 'HIGH',
        price: currentHigh,
        timestamp: candles[i].timestamp,
        index: i,
      });
    }
    
    // Check for Swing Low
    let isSwingLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && candles[j].low <= currentLow) {
        isSwingLow = false;
        break;
      }
    }
    
    if (isSwingLow) {
      swings.push({
        type: 'LOW',
        price: currentLow,
        timestamp: candles[i].timestamp,
        index: i,
      });
    }
  }
  
  return swings.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Detecta Break of Structure (BOS)
 * BOS Bullish: Preço quebra swing high anterior
 * BOS Bearish: Preço quebra swing low anterior
 */
export function detectBOS(candles: Candle[], swingPoints?: SwingPoint[]): BOSResult {
  if (!candles || candles.length < 10) {
    return {
      detected: false,
      direction: null,
      breakPrice: 0,
      swingPoint: null,
      timestamp: 0,
    };
  }
  
  const swings = swingPoints || findSwingPoints(candles);
  const recentCandles = candles.slice(-20);
  
  // Procurar BOS Bullish (quebra swing high)
  const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-3);
  if (recentHighs.length >= 2) {
    const lastHigh = recentHighs[recentHighs.length - 1];
    const prevHigh = recentHighs[recentHighs.length - 2];
    
    for (const candle of recentCandles) {
      if (candle.close > prevHigh.price && candle.timestamp > prevHigh.timestamp) {
        console.log(`🔺 BOS BULLISH detectado: Preço quebrou ${prevHigh.price.toFixed(2)}`);
        return {
          detected: true,
          direction: 'BULLISH',
          breakPrice: prevHigh.price,
          swingPoint: prevHigh,
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  // Procurar BOS Bearish (quebra swing low)
  const recentLows = swings.filter(s => s.type === 'LOW').slice(-3);
  if (recentLows.length >= 2) {
    const lastLow = recentLows[recentLows.length - 1];
    const prevLow = recentLows[recentLows.length - 2];
    
    for (const candle of recentCandles) {
      if (candle.close < prevLow.price && candle.timestamp > prevLow.timestamp) {
        console.log(`🔻 BOS BEARISH detectado: Preço quebrou ${prevLow.price.toFixed(2)}`);
        return {
          detected: true,
          direction: 'BEARISH',
          breakPrice: prevLow.price,
          swingPoint: prevLow,
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  return {
    detected: false,
    direction: null,
    breakPrice: 0,
    swingPoint: null,
    timestamp: 0,
  };
}

/**
 * Detecta Market Structure Shift (MSS)
 * Mudança de tendência de alta para baixa ou vice-versa
 */
export function detectMSS(candles: Candle[], swingPoints?: SwingPoint[]): MSSResult {
  if (!candles || candles.length < 15) {
    return {
      detected: false,
      direction: null,
      breakPrice: 0,
      swingPoint: null,
      timestamp: 0,
    };
  }
  
  const swings = swingPoints || findSwingPoints(candles);
  const recentCandles = candles.slice(-20);
  
  // Identificar tendência anterior
  const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-3);
  const recentLows = swings.filter(s => s.type === 'LOW').slice(-3);
  
  if (recentHighs.length < 2 || recentLows.length < 2) {
    return {
      detected: false,
      direction: null,
      breakPrice: 0,
      swingPoint: null,
      timestamp: 0,
    };
  }
  
  // MSS: Tendência de alta quebra swing low anterior (vira baixa)
  const isUptrend = recentHighs[recentHighs.length - 1].price > recentHighs[recentHighs.length - 2].price;
  if (isUptrend) {
    const lastLow = recentLows[recentLows.length - 1];
    for (const candle of recentCandles) {
      if (candle.close < lastLow.price && candle.timestamp > lastLow.timestamp) {
        console.log(`📉 MSS detectado: Alta → Baixa em ${lastLow.price.toFixed(2)}`);
        return {
          detected: true,
          direction: 'BULLISH_TO_BEARISH',
          breakPrice: lastLow.price,
          swingPoint: lastLow,
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  // MSS: Tendência de baixa quebra swing high anterior (vira alta)
  const isDowntrend = recentLows[recentLows.length - 1].price < recentLows[recentLows.length - 2].price;
  if (isDowntrend) {
    const lastHigh = recentHighs[recentHighs.length - 1];
    for (const candle of recentCandles) {
      if (candle.close > lastHigh.price && candle.timestamp > lastHigh.timestamp) {
        console.log(`📈 MSS detectado: Baixa → Alta em ${lastHigh.price.toFixed(2)}`);
        return {
          detected: true,
          direction: 'BEARISH_TO_BULLISH',
          breakPrice: lastHigh.price,
          swingPoint: lastHigh,
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  return {
    detected: false,
    direction: null,
    breakPrice: 0,
    swingPoint: null,
    timestamp: 0,
  };
}

/**
 * Identifica tendência atual baseado em múltiplos BOS
 * AJUSTADO: Detecta tendências fracas também
 */
export function identifyTrend(candles: Candle[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  if (!candles || candles.length < 20) {
    return 'NEUTRAL';
  }
  
  const swings = findSwingPoints(candles);
  const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-3);
  const recentLows = swings.filter(s => s.type === 'LOW').slice(-3);
  
  if (recentHighs.length < 2 || recentLows.length < 2) {
    return 'NEUTRAL';
  }
  
  // Tendência de alta FORTE: Múltiplos highs e lows ascendentes
  const highsAscending = recentHighs.every((high, i) => 
    i === 0 || high.price > recentHighs[i - 1].price
  );
  const lowsAscending = recentLows.every((low, i) => 
    i === 0 || low.price > recentLows[i - 1].price
  );
  
  if (highsAscending && lowsAscending) {
    return 'BULLISH';
  }
  
  // Tendência de baixa FORTE: Múltiplos highs e lows descendentes
  const highsDescending = recentHighs.every((high, i) => 
    i === 0 || high.price < recentHighs[i - 1].price
  );
  const lowsDescending = recentLows.every((low, i) => 
    i === 0 || low.price < recentLows[i - 1].price
  );
  
  if (highsDescending && lowsDescending) {
    return 'BEARISH';
  }
  
  // AJUSTADO: Detectar tendências FRACAS também
  // Tendência fraca de alta: Pelo menos 2 highs maiores
  const weakBullish = recentHighs.length >= 2 && 
    recentHighs[recentHighs.length - 1].price > recentHighs[0].price;
  
  if (weakBullish) {
    console.log('📈 Tendência FRACA de alta detectada');
    return 'BULLISH';
  }
  
  // Tendência fraca de baixa: Pelo menos 2 lows menores
  const weakBearish = recentLows.length >= 2 &&
    recentLows[recentLows.length - 1].price < recentLows[0].price;
  
  if (weakBearish) {
    console.log('📉 Tendência FRACA de baixa detectada');
    return 'BEARISH';
  }
  
  return 'NEUTRAL';
}
