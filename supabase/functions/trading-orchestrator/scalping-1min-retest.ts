/**
 * MÓDULO DE DETECÇÃO DE PULLBACK/RETESTE - SCALPING 1 MINUTO
 * 
 * Detecta quando o preço retorna (pullback) para testar a zona do Fair Value Gap (FVG).
 * Este reteste é necessário antes de procurar a vela de engolfo.
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PullbackResult {
  retestDetected: boolean;
  retestCandle: Candle | null;
  priceInFVG: boolean;
  retestType: 'WICK' | 'BODY' | 'NONE';
}

/**
 * Detecta pullback para a zona FVG
 */
export function detectPullbackToFVG(
  candles1m: Candle[],
  fvgZone: { top: number; bottom: number },
  direction: 'BUY' | 'SELL',
  fvgCandles: Candle[]
): PullbackResult {
  if (!candles1m || candles1m.length === 0) {
    return {
      retestDetected: false,
      retestCandle: null,
      priceInFVG: false,
      retestType: 'NONE'
    };
  }
  
  // Encontrar índice da última vela do FVG
  const lastFVGCandle = fvgCandles[2];
  const lastFVGIndex = candles1m.findIndex(c => c.timestamp === lastFVGCandle.timestamp);
  
  if (lastFVGIndex === -1 || lastFVGIndex === candles1m.length - 1) {
    return {
      retestDetected: false,
      retestCandle: null,
      priceInFVG: false,
      retestType: 'NONE'
    };
  }
  
  // Analisar velas após o FVG procurando por pullback
  for (let i = lastFVGIndex + 1; i < candles1m.length; i++) {
    const candle = candles1m[i];
    
    if (direction === 'BUY') {
      // Para BUY, aguardamos pullback (vela baixista) que entre na zona FVG
      const candleIsBearish = candle.close < candle.open;
      const priceEnteredFVG = isPriceInZone(candle, fvgZone);
      
      if (priceEnteredFVG) {
        const retestType = getRetestType(candle, fvgZone);
        
        console.log(`\n🔄 PULLBACK DETECTADO (BUY):`);
        console.log(`├─ Vela: ${new Date(candle.timestamp).toISOString()}`);
        console.log(`├─ Open: ${candle.open} | Close: ${candle.close}`);
        console.log(`├─ High: ${candle.high} | Low: ${candle.low}`);
        console.log(`├─ FVG Zone: ${fvgZone.bottom} - ${fvgZone.top}`);
        console.log(`├─ Tipo: ${retestType}`);
        console.log(`└─ Bearish: ${candleIsBearish ? '✅' : '❌'}`);
        
        return {
          retestDetected: true,
          retestCandle: candle,
          priceInFVG: true,
          retestType
        };
      }
    } else {
      // Para SELL, aguardamos pullback (vela altista) que entre na zona FVG
      const candleIsBullish = candle.close > candle.open;
      const priceEnteredFVG = isPriceInZone(candle, fvgZone);
      
      if (priceEnteredFVG) {
        const retestType = getRetestType(candle, fvgZone);
        
        console.log(`\n🔄 PULLBACK DETECTADO (SELL):`);
        console.log(`├─ Vela: ${new Date(candle.timestamp).toISOString()}`);
        console.log(`├─ Open: ${candle.open} | Close: ${candle.close}`);
        console.log(`├─ High: ${candle.high} | Low: ${candle.low}`);
        console.log(`├─ FVG Zone: ${fvgZone.bottom} - ${fvgZone.top}`);
        console.log(`├─ Tipo: ${retestType}`);
        console.log(`└─ Bullish: ${candleIsBullish ? '✅' : '❌'}`);
        
        return {
          retestDetected: true,
          retestCandle: candle,
          priceInFVG: true,
          retestType
        };
      }
    }
  }
  
  return {
    retestDetected: false,
    retestCandle: null,
    priceInFVG: false,
    retestType: 'NONE'
  };
}

/**
 * Verifica se o preço da vela está dentro da zona FVG
 */
function isPriceInZone(candle: Candle, zone: { top: number; bottom: number }): boolean {
  // Verificar se qualquer parte da vela (pavio ou corpo) toca a zona FVG
  const wickEntersZone = 
    (candle.low <= zone.top && candle.low >= zone.bottom) ||
    (candle.high <= zone.top && candle.high >= zone.bottom) ||
    (candle.low <= zone.bottom && candle.high >= zone.top);
  
  const bodyEntersZone =
    (candle.close <= zone.top && candle.close >= zone.bottom) ||
    (candle.open <= zone.top && candle.open >= zone.bottom);
  
  return wickEntersZone || bodyEntersZone;
}

/**
 * Determina o tipo de reteste (pavio ou corpo)
 */
function getRetestType(candle: Candle, zone: { top: number; bottom: number }): 'WICK' | 'BODY' | 'NONE' {
  const bodyHigh = Math.max(candle.open, candle.close);
  const bodyLow = Math.min(candle.open, candle.close);
  
  // Verifica se o corpo está na zona
  const bodyInZone = 
    (bodyHigh <= zone.top && bodyHigh >= zone.bottom) ||
    (bodyLow <= zone.top && bodyLow >= zone.bottom) ||
    (bodyLow <= zone.bottom && bodyHigh >= zone.top);
  
  if (bodyInZone) {
    return 'BODY';
  }
  
  // Verifica se apenas o pavio está na zona
  const wickInZone = isPriceInZone(candle, zone);
  
  if (wickInZone) {
    return 'WICK';
  }
  
  return 'NONE';
}
