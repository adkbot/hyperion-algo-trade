/**
 * MÓDULO DE DETECÇÃO DE VELA DE ENGOLFO - SCALPING 1 MINUTO
 * 
 * Detecta vela de engolfo (engulfing candle) após o reteste do FVG.
 * Esta é a confirmação final para entrada na operação.
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EngulfingResult {
  engulfingDetected: boolean;
  engulfingCandle: Candle | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  stopDistance: number;
}

/**
 * Obtém o tick size para um par específico
 */
async function getTickSize(asset: string): Promise<number> {
  // Para USDT Perpetual futures, o tick size padrão é 0.001 para a maioria dos pares
  // Pares como 1000SHIB têm tick size diferente
  
  const tickSizes: Record<string, number> = {
    '1000SHIBUSDT': 0.000001,
    '1000PEPEUSDT': 0.0000001,
    'BTCUSDT': 0.01,
    'ETHUSDT': 0.01,
    'BNBUSDT': 0.01,
  };
  
  return tickSizes[asset] || 0.001; // Default para outros pares
}

/**
 * Detecta vela de engolfo após reteste
 */
export async function detectEngulfingCandle(
  candles1m: Candle[],
  retestCandle: Candle,
  direction: 'BUY' | 'SELL',
  asset: string
): Promise<EngulfingResult> {
  if (!candles1m || candles1m.length === 0 || !retestCandle) {
    return {
      engulfingDetected: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      stopDistance: 0
    };
  }
  
  // Encontrar índice da vela de reteste
  const retestIndex = candles1m.findIndex(c => c.timestamp === retestCandle.timestamp);
  
  if (retestIndex === -1 || retestIndex === candles1m.length - 1) {
    return {
      engulfingDetected: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      stopDistance: 0
    };
  }
  
  // Analisar velas após o reteste procurando por engulfing
  for (let i = retestIndex + 1; i < candles1m.length; i++) {
    const currentCandle = candles1m[i];
    const previousCandle = candles1m[i - 1];
    
    if (direction === 'BUY') {
      const engulfing = isBullishEngulfing(currentCandle, previousCandle);
      
      if (engulfing) {
        const tickSize = await getTickSize(asset);
        const result = calculateTradeParams(
          currentCandle,
          retestCandle,
          direction,
          tickSize
        );
        
        console.log(`\n💚 VELA DE ENGOLFO BULLISH DETECTADA:`);
        console.log(`├─ Vela Anterior: O:${previousCandle.open} C:${previousCandle.close}`);
        console.log(`├─ Vela Engolfo: O:${currentCandle.open} C:${currentCandle.close}`);
        console.log(`├─ Entry Price: ${result.entryPrice}`);
        console.log(`├─ Stop Loss: ${result.stopLoss} (${result.stopDistance.toFixed(5)} abaixo)`);
        console.log(`├─ Take Profit: ${result.takeProfit}`);
        console.log(`├─ Risk/Reward: ${result.riskReward}:1`);
        console.log(`└─ Tick Size: ${tickSize}`);
        
        return {
          engulfingDetected: true,
          engulfingCandle: currentCandle,
          ...result
        };
      }
    } else {
      const engulfing = isBearishEngulfing(currentCandle, previousCandle);
      
      if (engulfing) {
        const tickSize = await getTickSize(asset);
        const result = calculateTradeParams(
          currentCandle,
          retestCandle,
          direction,
          tickSize
        );
        
        console.log(`\n❤️ VELA DE ENGOLFO BEARISH DETECTADA:`);
        console.log(`├─ Vela Anterior: O:${previousCandle.open} C:${previousCandle.close}`);
        console.log(`├─ Vela Engolfo: O:${currentCandle.open} C:${currentCandle.close}`);
        console.log(`├─ Entry Price: ${result.entryPrice}`);
        console.log(`├─ Stop Loss: ${result.stopLoss} (${result.stopDistance.toFixed(5)} acima)`);
        console.log(`├─ Take Profit: ${result.takeProfit}`);
        console.log(`├─ Risk/Reward: ${result.riskReward}:1`);
        console.log(`└─ Tick Size: ${tickSize}`);
        
        return {
          engulfingDetected: true,
          engulfingCandle: currentCandle,
          ...result
        };
      }
    }
  }
  
  return {
    engulfingDetected: false,
    engulfingCandle: null,
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    riskReward: 0,
    stopDistance: 0
  };
}

/**
 * Verifica se a vela atual é um engolfo bullish da vela anterior
 * REGRA: O corpo da vela atual deve engolfar COMPLETAMENTE o corpo da vela anterior
 */
function isBullishEngulfing(currentCandle: Candle, previousCandle: Candle): boolean {
  const currentBody = {
    top: Math.max(currentCandle.open, currentCandle.close),
    bottom: Math.min(currentCandle.open, currentCandle.close)
  };
  
  const previousBody = {
    top: Math.max(previousCandle.open, previousCandle.close),
    bottom: Math.min(previousCandle.open, previousCandle.close)
  };
  
  // Vela atual deve ser bullish (close > open)
  const isBullish = currentCandle.close > currentCandle.open;
  
  // Corpo atual deve engolfar completamente o corpo anterior
  const engulfs = 
    currentBody.bottom <= previousBody.bottom &&
    currentBody.top >= previousBody.top;
  
  return isBullish && engulfs;
}

/**
 * Verifica se a vela atual é um engolfo bearish da vela anterior
 * REGRA: O corpo da vela atual deve engolfar COMPLETAMENTE o corpo da vela anterior
 */
function isBearishEngulfing(currentCandle: Candle, previousCandle: Candle): boolean {
  const currentBody = {
    top: Math.max(currentCandle.open, currentCandle.close),
    bottom: Math.min(currentCandle.open, currentCandle.close)
  };
  
  const previousBody = {
    top: Math.max(previousCandle.open, previousCandle.close),
    bottom: Math.min(previousCandle.open, previousCandle.close)
  };
  
  // Vela atual deve ser bearish (close < open)
  const isBearish = currentCandle.close < currentCandle.open;
  
  // Corpo atual deve engolfar completamente o corpo anterior
  const engulfs = 
    currentBody.bottom <= previousBody.bottom &&
    currentBody.top >= previousBody.top;
  
  return isBearish && engulfs;
}

/**
 * Calcula parâmetros da operação: Entry, Stop Loss, Take Profit
 * REGRAS:
 * - Entry: Close da vela de engolfo
 * - Stop Loss (LONG): 1 tick abaixo da LOW da vela de reteste
 * - Stop Loss (SHORT): 1 tick acima da HIGH da vela de reteste
 * - Take Profit: SEMPRE 3:1 Risk/Reward
 */
function calculateTradeParams(
  engulfingCandle: Candle,
  retestCandle: Candle,
  direction: 'BUY' | 'SELL',
  tickSize: number
) {
  const entryPrice = engulfingCandle.close;
  
  let stopLoss: number;
  let stopDistance: number;
  
  if (direction === 'BUY') {
    // LONG: Stop 1 tick abaixo da LOW do reteste
    stopLoss = retestCandle.low - tickSize;
    stopDistance = entryPrice - stopLoss;
  } else {
    // SHORT: Stop 1 tick acima da HIGH do reteste
    stopLoss = retestCandle.high + tickSize;
    stopDistance = stopLoss - entryPrice;
  }
  
  // Take Profit: SEMPRE 3:1
  const takeProfit = direction === 'BUY'
    ? entryPrice + (stopDistance * 3)
    : entryPrice - (stopDistance * 3);
  
  return {
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward: 3,  // SEMPRE 3:1
    stopDistance
  };
}
