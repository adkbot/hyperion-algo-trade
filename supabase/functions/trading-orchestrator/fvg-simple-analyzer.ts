/**
 * FVG_SIMPLE Strategy - Estratégia simplificada de FVG
 * 
 * Requisitos:
 * 1. FVG detectado no 15m (mínimo score 2/4)
 * 2. Liquidity Sweep no 15m antes do FVG
 * 3. Preço atual próximo ao entry (CE do FVG)
 * 
 * NÃO exige:
 * - BOS no 1m
 * - Confirmação multi-timeframe complexa
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FVGSimpleResult {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  confidence: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  reason: string;
  fvgDetails?: any;
  sweepDetails?: any;
}

export async function analyzeFVGSimple(
  candles15m: Candle[],
  candles1m: Candle[],
  asset: string
): Promise<FVGSimpleResult> {
  
  console.log(`\n🔵 ===== FVG_SIMPLE STRATEGY ANALYSIS =====`);
  console.log(`Asset: ${asset}`);
  console.log(`Candles 15m: ${candles15m.length}`);

  if (candles15m.length < 50) {
    return {
      signal: 'STAY_OUT',
      confidence: 0,
      reason: 'Histórico insuficiente de candles 15m'
    };
  }

  const currentPrice = candles15m[candles15m.length - 1].close;

  // PASSO 1: Detectar FVGs no 15m (últimos 20 candles)
  const recentCandles15m = candles15m.slice(-20);
  const fvgs = detectSimpleFVGs(recentCandles15m);

  console.log(`\n🔍 PASSO 1: Detectados ${fvgs.length} FVGs no 15m`);

  if (fvgs.length === 0) {
    return {
      signal: 'STAY_OUT',
      confidence: 0,
      reason: 'Nenhum FVG detectado no 15m'
    };
  }

  // PASSO 2: Filtrar FVGs por qualidade (score >= 2)
  const qualityFVGs = fvgs.filter(fvg => fvg.qualityScore >= 2);

  console.log(`   FVGs com qualidade >= 2: ${qualityFVGs.length}`);

  if (qualityFVGs.length === 0) {
    return {
      signal: 'STAY_OUT',
      confidence: 0,
      reason: 'Nenhum FVG de qualidade suficiente (score >= 2)'
    };
  }

  // PASSO 3: Encontrar FVG mais próximo e válido
  const validFVG = findValidFVG(qualityFVGs, currentPrice);

  if (!validFVG) {
    return {
      signal: 'STAY_OUT',
      confidence: 0,
      reason: 'Nenhum FVG válido próximo ao preço atual'
    };
  }

  console.log(`\n✅ FVG VÁLIDO encontrado:`);
  console.log(`   Tipo: ${validFVG.type}`);
  console.log(`   CE: ${validFVG.ce}`);
  console.log(`   Score: ${validFVG.qualityScore}/4`);
  console.log(`   Distância: ${((Math.abs(currentPrice - validFVG.ce) / currentPrice) * 100).toFixed(2)}%`);

  // PASSO 4: Validar Sweep antes do FVG
  const hasSweep = checkSweepBeforeFVG(candles15m, validFVG);

  if (!hasSweep) {
    return {
      signal: 'STAY_OUT',
      confidence: 0,
      reason: 'FVG sem Liquidity Sweep prévio'
    };
  }

  console.log(`   ✅ Liquidity Sweep confirmado`);

  // PASSO 5: Gerar Sinal
  const signal = validFVG.type === 'BISI' ? 'BUY' : 'SELL';
  const entryPrice = validFVG.ce;

  // Risk/Reward 1:3
  const fvgSize = Math.abs(validFVG.top - validFVG.bottom);
  const stopLoss = signal === 'BUY' 
    ? entryPrice - (fvgSize * 1.5)
    : entryPrice + (fvgSize * 1.5);
  
  const takeProfit = signal === 'BUY'
    ? entryPrice + (fvgSize * 4.5)
    : entryPrice - (fvgSize * 4.5);

  // Confidence baseada em qualidade do FVG e proximidade
  const distanceRatio = Math.abs(currentPrice - entryPrice) / entryPrice;
  const proximityScore = Math.max(0, 1 - (distanceRatio / 0.02)); // 2% max distance
  const confidence = Math.round(
    (validFVG.qualityScore / 4) * 0.6 + proximityScore * 0.4
  ) * 100;

  console.log(`\n🎯 SINAL GERADO: ${signal}`);
  console.log(`   Entry: ${entryPrice}`);
  console.log(`   Stop: ${stopLoss}`);
  console.log(`   Target: ${takeProfit}`);
  console.log(`   Confidence: ${confidence}%`);

  return {
    signal,
    confidence,
    entryPrice,
    stopLoss,
    takeProfit,
    reason: `FVG ${validFVG.type} no 15m com Sweep (score: ${validFVG.qualityScore}/4)`,
    fvgDetails: validFVG,
    sweepDetails: { confirmed: true }
  };
}

// Detecta FVGs simples no timeframe
function detectSimpleFVGs(candles: Candle[]) {
  const fvgs = [];

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c2 = candles[i - 1];
    const c3 = candles[i];

    // Bullish FVG (BISI)
    if (c3.low > c1.high) {
      const gap = c3.low - c1.high;
      const ce = (c3.low + c1.high) / 2;
      const qualityScore = calculateQualityScore(c1, c2, c3, 'BISI', candles, i);

      fvgs.push({
        type: 'BISI',
        top: c3.low,
        bottom: c1.high,
        ce,
        gap,
        index: i,
        timestamp: c3.timestamp,
        qualityScore
      });
    }

    // Bearish FVG (CIBI)
    if (c3.high < c1.low) {
      const gap = c1.low - c3.high;
      const ce = (c1.low + c3.high) / 2;
      const qualityScore = calculateQualityScore(c1, c2, c3, 'CIBI', candles, i);

      fvgs.push({
        type: 'CIBI',
        top: c1.low,
        bottom: c3.high,
        ce,
        gap,
        index: i,
        timestamp: c3.timestamp,
        qualityScore
      });
    }
  }

  return fvgs;
}

// Calcula score de qualidade (0-4)
function calculateQualityScore(
  c1: Candle,
  c2: Candle,
  c3: Candle,
  type: string,
  candles: Candle[],
  index: number
): number {
  let score = 0;

  // 1. Volume do candle central (c2) acima da média
  const avgVolume = candles.slice(Math.max(0, index - 10), index)
    .reduce((sum, c) => sum + c.volume, 0) / Math.min(10, index);
  
  if (c2.volume > avgVolume * 1.2) score++;

  // 2. FVG não foi mitigado ainda
  const candlesAfter = candles.slice(index);
  const isMitigated = candlesAfter.some(c => {
    const ce = type === 'BISI' ? (c3.low + c1.high) / 2 : (c1.low + c3.high) / 2;
    return Math.abs(c.close - ce) / ce < 0.001;
  });
  
  if (!isMitigated) score++;

  // 3. Gap é significativo (> 0.5% do preço)
  const gap = type === 'BISI' ? c3.low - c1.high : c1.low - c3.high;
  if (gap / c2.close > 0.005) score++;

  // 4. Candle c2 é expressivo (body > 60% da range)
  const c2Body = Math.abs(c2.close - c2.open);
  const c2Range = c2.high - c2.low;
  if (c2Range > 0 && c2Body / c2Range > 0.6) score++;

  return score;
}

// Encontra FVG válido mais próximo do preço atual
function findValidFVG(fvgs: any[], currentPrice: number) {
  // Ordena por proximidade ao preço atual
  const sorted = fvgs
    .map(fvg => ({
      ...fvg,
      distance: Math.abs(currentPrice - fvg.ce)
    }))
    .sort((a, b) => a.distance - b.distance);

  // Retorna o mais próximo se estiver dentro de 2%
  for (const fvg of sorted) {
    const distancePercent = fvg.distance / currentPrice;
    if (distancePercent < 0.02) { // 2% max
      return fvg;
    }
  }

  return null;
}

// Verifica se houve Sweep antes do FVG
function checkSweepBeforeFVG(candles: Candle[], fvg: any): boolean {
  const fvgIndex = fvg.index;
  const lookbackCandles = candles.slice(Math.max(0, fvgIndex - 10), fvgIndex);

  if (lookbackCandles.length < 5) return false;

  // Encontra swing high/low nos candles anteriores
  const highs = lookbackCandles.map(c => c.high);
  const lows = lookbackCandles.map(c => c.low);
  const swingHigh = Math.max(...highs);
  const swingLow = Math.min(...lows);

  // Para FVG de compra (BISI), precisa ter sweep de baixa antes
  if (fvg.type === 'BISI') {
    return lookbackCandles.some(c => c.low <= swingLow && c.close > swingLow);
  }

  // Para FVG de venda (CIBI), precisa ter sweep de alta antes
  if (fvg.type === 'CIBI') {
    return lookbackCandles.some(c => c.high >= swingHigh && c.close < swingHigh);
  }

  return false;
}
