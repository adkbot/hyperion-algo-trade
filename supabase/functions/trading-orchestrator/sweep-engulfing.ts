// ============================================
// SWEEP LIQUIDITY - ENGULFING CONFIRMATION
// ============================================
// Detecta engulfing IMEDIATAMENTE APÓS o sweep de liquidez

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
  expressiveCandleConfirmed: boolean;
}

/**
 * Verifica se uma vela é bullish engulfing
 */
function isBullishEngulfing(currentCandle: Candle, previousCandle: Candle): boolean {
  const currentBody = currentCandle.close - currentCandle.open;
  const previousBody = previousCandle.close - previousCandle.open;
  
  // Vela atual deve ser verde (bullish)
  const isCurrentBullish = currentBody > 0;
  
  // Vela atual engolfa completamente o corpo da anterior
  const engulfsBody = currentCandle.open <= previousCandle.close && 
                      currentCandle.close >= previousCandle.open;
  
  // Corpo da vela atual deve ser maior que o anterior
  const strongerBody = Math.abs(currentBody) > Math.abs(previousBody);
  
  return isCurrentBullish && engulfsBody && strongerBody;
}

/**
 * Verifica se uma vela é bearish engulfing
 */
function isBearishEngulfing(currentCandle: Candle, previousCandle: Candle): boolean {
  const currentBody = currentCandle.close - currentCandle.open;
  const previousBody = previousCandle.close - previousCandle.open;
  
  // Vela atual deve ser vermelha (bearish)
  const isCurrentBearish = currentBody < 0;
  
  // Vela atual engolfa completamente o corpo da anterior
  const engulfsBody = currentCandle.open >= previousCandle.close && 
                      currentCandle.close <= previousCandle.open;
  
  // Corpo da vela atual deve ser maior que o anterior
  const strongerBody = Math.abs(currentBody) > Math.abs(previousBody);
  
  return isCurrentBearish && engulfsBody && strongerBody;
}

/**
 * Calcula volume médio e tamanho médio do corpo das últimas N velas
 */
function calculateAverages(candles: Candle[], count: number = 20): { avgVolume: number, avgBodySize: number } {
  const recentCandles = candles.slice(-count);
  
  const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
  const avgBodySize = recentCandles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / recentCandles.length;
  
  return { avgVolume, avgBodySize };
}

/**
 * Valida se a vela engulfing é "expressiva" conforme critério
 * Critério: Volume >= 1.5x média OU Corpo >= 2x média
 */
function isExpressiveCandle(candle: Candle, avgVolume: number, avgBodySize: number): boolean {
  const bodySize = Math.abs(candle.close - candle.open);
  const volumeRatio = candle.volume / avgVolume;
  const bodySizeRatio = bodySize / avgBodySize;
  
  const isExpressive = volumeRatio >= 1.5 || bodySizeRatio >= 2.0;
  
  console.log(`   🔍 Validação Vela Expressiva (Engulfing - Sweep):`);
  console.log(`      ├─ Volume: ${candle.volume.toFixed(2)} (${volumeRatio.toFixed(2)}x média)`);
  console.log(`      ├─ Corpo: ${bodySize.toFixed(5)} (${bodySizeRatio.toFixed(2)}x média)`);
  console.log(`      └─ Expressiva: ${isExpressive ? '✅ SIM' : '❌ NÃO'}`);
  
  return isExpressive;
}

/**
 * Detecta engulfing FORTE imediatamente após sweep de liquidez
 * REGRA: A vela SEGUINTE ao sweep deve ser um engulfing confirmando a direção
 */
export async function detectEngulfingAfterSweep(
  candles1m: Candle[],
  sweepCandle: Candle,
  direction: 'BUY' | 'SELL',
  asset: string
): Promise<EngulfingResult> {
  if (!candles1m || candles1m.length < 2) {
    return {
      engulfingDetected: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  // Encontrar índice da vela de sweep
  const sweepIndex = candles1m.findIndex(c => c.timestamp === sweepCandle.timestamp);
  
  if (sweepIndex === -1 || sweepIndex >= candles1m.length - 1) {
    console.log('⏳ Aguardando vela seguinte ao sweep...');
    return {
      engulfingDetected: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  // Vela IMEDIATAMENTE APÓS o sweep
  const nextCandle = candles1m[sweepIndex + 1];
  
  // Verificar se é um engulfing FORTE
  const isEngulfing = direction === 'BUY'
    ? isBullishEngulfing(nextCandle, sweepCandle)
    : isBearishEngulfing(nextCandle, sweepCandle);
  
  if (!isEngulfing) {
    console.log(`❌ Vela seguinte ao sweep NÃO é engulfing ${direction}. CANCELAR operação.`);
    return {
      engulfingDetected: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  // NOVO: Calcular médias para validação de vela expressiva
  const { avgVolume, avgBodySize } = calculateAverages(candles1m, 20);
  
  // NOVO: Validar se a vela engulfing é expressiva
  const expressiveConfirmed = isExpressiveCandle(nextCandle, avgVolume, avgBodySize);
  
  if (!expressiveConfirmed) {
    console.log(`❌ Engulfing detectado mas NÃO é vela expressiva. CANCELAR operação.`);
    return {
      engulfingDetected: true,
      engulfingCandle: nextCandle,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  // ✅ Engulfing confirmado E vela expressiva
  console.log(`✅ ENGULFING ${direction} EXPRESSIVO CONFIRMADO após sweep!`);
  console.log(`   ├─ Sweep Candle: ${sweepCandle.close}`);
  console.log(`   ├─ Engulfing Candle: ${nextCandle.close}`);
  console.log(`   └─ Vela Expressiva: ✅ CONFIRMADA`);
  
  // Calcular níveis de entrada, stop e take profit
  let entryPrice: number;
  let stopLoss: number;
  let takeProfit: number;
  
  if (direction === 'BUY') {
    entryPrice = nextCandle.close;
    stopLoss = Math.min(sweepCandle.low, nextCandle.low) * 0.9995; // Stop abaixo da mínima
    const risk = entryPrice - stopLoss;
    takeProfit = entryPrice + (risk * 2.0); // R:R 1:2
  } else {
    entryPrice = nextCandle.close;
    stopLoss = Math.max(sweepCandle.high, nextCandle.high) * 1.0005; // Stop acima da máxima
    const risk = stopLoss - entryPrice;
    takeProfit = entryPrice - (risk * 2.0); // R:R 1:2
  }
  
  const riskReward = Math.abs(takeProfit - entryPrice) / Math.abs(entryPrice - stopLoss);
  
  console.log(`📊 Níveis calculados (Sweep + Engulfing ${direction}):`);
  console.log(`   ├─ Entry: ${entryPrice.toFixed(6)}`);
  console.log(`   ├─ Stop: ${stopLoss.toFixed(6)}`);
  console.log(`   ├─ Take Profit: ${takeProfit.toFixed(6)}`);
  console.log(`   └─ R:R: 1:${riskReward.toFixed(2)}`);
  
  return {
    engulfingDetected: true,
    engulfingCandle: nextCandle,
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
    expressiveCandleConfirmed: true,
  };
}
