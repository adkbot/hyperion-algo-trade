// ============================================
// FIRST CANDLE RULE - ENGULFING CONFIRMATION
// ============================================
// Detecta engulfing IMEDIATAMENTE APÓS o reteste (vela seguinte)

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface EngulfingResult {
  hasEngulfing: boolean;
  engulfingCandle: Candle | null;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  expressiveCandleConfirmed: boolean; // NOVO: Validação de vela expressiva
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
  
  console.log(`   🔍 Validação Vela Expressiva (Engulfing):`);
  console.log(`      ├─ Volume: ${candle.volume.toFixed(2)} (${volumeRatio.toFixed(2)}x média)`);
  console.log(`      ├─ Corpo: ${bodySize.toFixed(5)} (${bodySizeRatio.toFixed(2)}x média)`);
  console.log(`      └─ Expressiva: ${isExpressive ? '✅ SIM' : '❌ NÃO'}`);
  
  return isExpressive;
}

/**
 * Detecta engulfing FORTE imediatamente após reteste
 * REGRA: A vela SEGUINTE ao reteste deve ser um engulfing confirmando a direção
 */
export async function detectEngulfingAfterRetest(
  candles1m: Candle[],
  retestCandle: Candle,
  direction: 'BUY' | 'SELL',
  asset: string
): Promise<EngulfingResult> {
  if (!candles1m || candles1m.length < 2) {
    return {
      hasEngulfing: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  // Encontrar índice da vela de reteste
  const retestIndex = candles1m.findIndex(c => c.timestamp === retestCandle.timestamp);
  
  if (retestIndex === -1 || retestIndex >= candles1m.length - 1) {
    console.log('⏳ Aguardando vela seguinte ao reteste...');
    return {
      hasEngulfing: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  // Vela IMEDIATAMENTE APÓS o reteste
  const nextCandle = candles1m[retestIndex + 1];
  
  // Verificar se é um engulfing FORTE
  const isEngulfing = direction === 'BUY'
    ? isBullishEngulfing(nextCandle, retestCandle)
    : isBearishEngulfing(nextCandle, retestCandle);
  
  if (!isEngulfing) {
    console.log(`❌ Vela seguinte ao reteste NÃO é engulfing ${direction}. CANCELAR operação.`);
    return {
      hasEngulfing: false,
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
    console.log(`❌ Vela engulfing NÃO é expressiva - SINAL REJEITADO`);
    return {
      hasEngulfing: false,
      engulfingCandle: null,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      expressiveCandleConfirmed: false,
    };
  }
  
  console.log(`🎯 ENGULFING CONFIRMADO após reteste (${direction}) + Vela Expressiva ✅`);
  console.log(`   Retest Candle: O:${retestCandle.open} H:${retestCandle.high} L:${retestCandle.low} C:${retestCandle.close}`);
  console.log(`   Engulfing Candle: O:${nextCandle.open} H:${nextCandle.high} L:${nextCandle.low} C:${nextCandle.close}`);
  console.log(`   Time: ${new Date(nextCandle.timestamp).toISOString()}`);
  
  // Calcular parâmetros de trade
  const tickSize = await getTickSize(asset);
  const tradeParams = calculateTradeParams(nextCandle, retestCandle, direction, tickSize);
  
  return {
    hasEngulfing: true,
    engulfingCandle: nextCandle,
    expressiveCandleConfirmed: true,
    ...tradeParams,
  };
}

/**
 * Verifica engulfing bullish (COMPRA)
 */
function isBullishEngulfing(currentCandle: Candle, previousCandle: Candle): boolean {
  // Vela atual deve ser BULLISH (close > open)
  if (currentCandle.close <= currentCandle.open) return false;
  
  // Corpo da vela atual deve engolir COMPLETAMENTE o corpo da anterior
  const currentBody = Math.abs(currentCandle.close - currentCandle.open);
  const previousBody = Math.abs(previousCandle.close - previousCandle.open);
  
  const engulfs = 
    currentCandle.open <= Math.min(previousCandle.open, previousCandle.close) &&
    currentCandle.close >= Math.max(previousCandle.open, previousCandle.close);
  
  // Engulfing deve ser FORTE (corpo atual pelo menos 1.5x maior que anterior)
  const isStrong = currentBody >= previousBody * 1.3;
  
  return engulfs && isStrong;
}

/**
 * Verifica engulfing bearish (VENDA)
 */
function isBearishEngulfing(currentCandle: Candle, previousCandle: Candle): boolean {
  // Vela atual deve ser BEARISH (close < open)
  if (currentCandle.close >= currentCandle.open) return false;
  
  // Corpo da vela atual deve engolir COMPLETAMENTE o corpo da anterior
  const currentBody = Math.abs(currentCandle.close - currentCandle.open);
  const previousBody = Math.abs(previousCandle.close - previousCandle.open);
  
  const engulfs = 
    currentCandle.open >= Math.max(previousCandle.open, previousCandle.close) &&
    currentCandle.close <= Math.min(previousCandle.open, previousCandle.close);
  
  // Engulfing deve ser FORTE (corpo atual pelo menos 1.5x maior que anterior)
  const isStrong = currentBody >= previousBody * 1.3;
  
  return engulfs && isStrong;
}

/**
 * Calcula parâmetros de trade com RR 3:1
 */
function calculateTradeParams(
  engulfingCandle: Candle,
  retestCandle: Candle,
  direction: 'BUY' | 'SELL',
  tickSize: number
): { entryPrice: number; stopLoss: number; takeProfit: number; riskReward: number; } {
  let entryPrice: number;
  let stopLoss: number;
  let takeProfit: number;
  
  if (direction === 'BUY') {
    // ✅ COMPRA (LONG):
    // - Entrada: Close do engulfing
    // - Stop: ABAIXO da MÍNIMA entre engulfing e reteste
    // - TP: ACIMA da entrada (RR 3:1)
    entryPrice = engulfingCandle.close;
    stopLoss = Math.min(engulfingCandle.low, retestCandle.low) - (tickSize * 2);  // Stop ABAIXO
    
    const stopDistance = Math.abs(entryPrice - stopLoss);
    takeProfit = entryPrice + (stopDistance * 3);  // TP ACIMA
    
    console.log(`🟢 BUY: Entry ${entryPrice} | Stop ${stopLoss} (ABAIXO) | TP ${takeProfit} (ACIMA)`);
    console.log(`   📏 Engulfing Low: ${engulfingCandle.low} | Retest Low: ${retestCandle.low}`);
    console.log(`   📏 Stop Distance: ${stopDistance.toFixed(4)} | TP Distance: ${(stopDistance * 3).toFixed(4)}`);
    
  } else { // SELL
    // ✅ VENDA (SHORT):
    // - Entrada: Close do engulfing
    // - Stop: ACIMA da MÁXIMA entre engulfing e reteste
    // - TP: ABAIXO da entrada (RR 3:1)
    entryPrice = engulfingCandle.close;
    stopLoss = Math.max(engulfingCandle.high, retestCandle.high) + (tickSize * 2);  // Stop ACIMA
    
    const stopDistance = Math.abs(stopLoss - entryPrice);
    takeProfit = entryPrice - (stopDistance * 3);  // TP ABAIXO
    
    console.log(`🔴 SELL: Entry ${entryPrice} | Stop ${stopLoss} (ACIMA) | TP ${takeProfit} (ABAIXO)`);
    console.log(`   📏 Engulfing High: ${engulfingCandle.high} | Retest High: ${retestCandle.high}`);
    console.log(`   📏 Stop Distance: ${stopDistance.toFixed(4)} | TP Distance: ${(stopDistance * 3).toFixed(4)}`);
  }
  
  // Arredondar para tickSize
  entryPrice = Math.round(entryPrice / tickSize) * tickSize;
  stopLoss = Math.round(stopLoss / tickSize) * tickSize;
  takeProfit = Math.round(takeProfit / tickSize) * tickSize;
  
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const profitDistance = Math.abs(takeProfit - entryPrice);
  const riskReward = profitDistance / stopDistance;
  
  // ✅ VALIDAÇÃO DE SANIDADE
  if (direction === 'BUY' && stopLoss >= entryPrice) {
    console.error(`❌ ERRO: Stop Loss para BUY deve estar ABAIXO da entrada!`);
    console.error(`   Entry: ${entryPrice}, Stop: ${stopLoss}`);
    throw new Error('Invalid Stop Loss calculation for BUY - Stop must be BELOW entry');
  }
  
  if (direction === 'SELL' && stopLoss <= entryPrice) {
    console.error(`❌ ERRO: Stop Loss para SELL deve estar ACIMA da entrada!`);
    console.error(`   Entry: ${entryPrice}, Stop: ${stopLoss}`);
    throw new Error('Invalid Stop Loss calculation for SELL - Stop must be ABOVE entry');
  }
  
  if (direction === 'BUY' && takeProfit <= entryPrice) {
    console.error(`❌ ERRO: Take Profit para BUY deve estar ACIMA da entrada!`);
    throw new Error('Invalid Take Profit calculation for BUY - TP must be ABOVE entry');
  }
  
  if (direction === 'SELL' && takeProfit >= entryPrice) {
    console.error(`❌ ERRO: Take Profit para SELL deve estar ABAIXO da entrada!`);
    throw new Error('Invalid Take Profit calculation for SELL - TP must be BELOW entry');
  }
  
  console.log(`📊 Parâmetros de Trade (VALIDADOS):`);
  console.log(`   Entry: ${entryPrice}`);
  console.log(`   Stop: ${stopLoss} (${direction === 'BUY' ? 'ABAIXO ✅' : 'ACIMA ✅'})`);
  console.log(`   TP: ${takeProfit} (${direction === 'BUY' ? 'ACIMA ✅' : 'ABAIXO ✅'})`);
  console.log(`   RR: ${riskReward.toFixed(2)}:1`);
  
  return {
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward,
  };
}

/**
 * Busca tick size do ativo
 */
async function getTickSize(asset: string): Promise<number> {
  const tickSizes: Record<string, number> = {
    'BTCUSDT': 0.1,
    '1000PEPEUSDT': 0.0000001,
    '1000BONKUSDT': 0.00000001,
    'SOLUSDT': 0.001,
    'ETHUSDT': 0.01,
  };
  
  return tickSizes[asset] || 0.001;
}
