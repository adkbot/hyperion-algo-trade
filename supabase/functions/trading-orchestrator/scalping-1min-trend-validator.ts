/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║         SCALPING 1MIN - VALIDAÇÃO RIGOROSA DE TENDÊNCIA CONFIRMADA       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Este módulo implementa validação EXTREMAMENTE RIGOROSA de tendência antes
 * de permitir entrada em operações.
 * 
 * CRITÉRIOS PARA TENDÊNCIA BULLISH CONFIRMADA:
 * ✅ Pelo menos 3 das últimas 5 velas fecharam verde (close > open)
 * ✅ Sequência de mínimos ascendentes (higher lows)
 * ✅ Sequência de máximos ascendentes (higher highs)
 * ✅ Volume médio crescente nas velas verdes
 * ✅ Preço atual acima da média móvel simples de 10 períodos
 * 
 * CRITÉRIOS PARA TENDÊNCIA BEARISH CONFIRMADA:
 * ✅ Pelo menos 3 das últimas 5 velas fecharam vermelhas (close < open)
 * ✅ Sequência de máximos descendentes (lower highs)
 * ✅ Sequência de mínimos descendentes (lower lows)
 * ✅ Volume médio decrescente ou flat nas velas vermelhas
 * ✅ Preço atual abaixo da média móvel simples de 10 períodos
 */

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  timestamp: number;
}

export interface TrendValidation {
  isTrending: boolean;
  direction: 'BUY' | 'SELL' | null;
  strength: number; // 0-100
  consecutiveCandles: number;
  volumeTrend: 'INCREASING' | 'DECREASING' | 'FLAT';
  priceVsMA: 'ABOVE' | 'BELOW' | 'NEUTRAL';
  higherLowsConfirmed: boolean;
  lowerHighsConfirmed: boolean;
  ma10: number;
  currentPrice: number;
  notes: string;
  detailedAnalysis: string[];
}

/**
 * Calcula a Média Móvel Simples (SMA) para N períodos
 */
function calculateSMA(candles: Candle[], periods: number): number {
  if (candles.length < periods) {
    return candles[candles.length - 1].close;
  }
  
  const relevantCandles = candles.slice(-periods);
  const sum = relevantCandles.reduce((acc, candle) => acc + candle.close, 0);
  return sum / periods;
}

/**
 * Valida se há sequência de mínimos ascendentes (Higher Lows)
 * Requerido para tendência bullish
 */
function validateHigherLows(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  
  const recentCandles = candles.slice(-10); // Últimas 10 velas
  let higherLowCount = 0;
  
  for (let i = 1; i < recentCandles.length; i++) {
    if (recentCandles[i].low >= recentCandles[i - 1].low) {
      higherLowCount++;
    }
  }
  
  // Pelo menos 60% das velas devem ter mínimos ascendentes
  return higherLowCount >= (recentCandles.length - 1) * 0.6;
}

/**
 * Valida se há sequência de máximos descendentes (Lower Highs)
 * Requerido para tendência bearish
 */
function validateLowerHighs(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  
  const recentCandles = candles.slice(-10); // Últimas 10 velas
  let lowerHighCount = 0;
  
  for (let i = 1; i < recentCandles.length; i++) {
    if (recentCandles[i].high <= recentCandles[i - 1].high) {
      lowerHighCount++;
    }
  }
  
  // Pelo menos 60% das velas devem ter máximos descendentes
  return lowerHighCount >= (recentCandles.length - 1) * 0.6;
}

/**
 * Valida se há sequência de máximos ascendentes (Higher Highs)
 * Requerido para tendência bullish
 */
function validateHigherHighs(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  
  const recentCandles = candles.slice(-10); // Últimas 10 velas
  let higherHighCount = 0;
  
  for (let i = 1; i < recentCandles.length; i++) {
    if (recentCandles[i].high >= recentCandles[i - 1].high) {
      higherHighCount++;
    }
  }
  
  // Pelo menos 60% das velas devem ter máximos ascendentes
  return higherHighCount >= (recentCandles.length - 1) * 0.6;
}

/**
 * Valida se há sequência de mínimos descendentes (Lower Lows)
 * Requerido para tendência bearish
 */
function validateLowerLows(candles: Candle[]): boolean {
  if (candles.length < 3) return false;
  
  const recentCandles = candles.slice(-10); // Últimas 10 velas
  let lowerLowCount = 0;
  
  for (let i = 1; i < recentCandles.length; i++) {
    if (recentCandles[i].low <= recentCandles[i - 1].low) {
      lowerLowCount++;
    }
  }
  
  // Pelo menos 60% das velas devem ter mínimos descendentes
  return lowerLowCount >= (recentCandles.length - 1) * 0.6;
}

/**
 * Analisa a tendência de volume nas últimas velas
 */
function analyzeVolumeTrend(candles: Candle[], direction: 'BUY' | 'SELL'): 'INCREASING' | 'DECREASING' | 'FLAT' {
  if (candles.length < 5) return 'FLAT';
  
  const recentCandles = candles.slice(-10);
  const firstHalfAvg = recentCandles.slice(0, 5).reduce((acc, c) => acc + c.volume, 0) / 5;
  const secondHalfAvg = recentCandles.slice(5).reduce((acc, c) => acc + c.volume, 0) / 5;
  
  const volumeChange = (secondHalfAvg - firstHalfAvg) / firstHalfAvg;
  
  // Para tendência bullish, queremos volume crescente
  if (direction === 'BUY') {
    if (volumeChange > 0.15) return 'INCREASING'; // Volume 15% maior
    if (volumeChange < -0.15) return 'DECREASING';
    return 'FLAT';
  }
  
  // Para tendência bearish, aceitamos volume flat ou crescente
  if (volumeChange > 0.15) return 'INCREASING';
  if (volumeChange < -0.15) return 'DECREASING';
  return 'FLAT';
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║                    VALIDAÇÃO PRINCIPAL DE TENDÊNCIA                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 * 
 * Esta função implementa a validação EXTREMAMENTE RIGOROSA de tendência.
 * SOMENTE retorna true se TODOS os critérios forem atendidos.
 */
export function validateTrend(
  candles: Candle[], 
  expectedDirection: 'BUY' | 'SELL'
): TrendValidation {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔍 VALIDAÇÃO RIGOROSA DE TENDÊNCIA - Direção esperada: ${expectedDirection}`);
  console.log(`${'='.repeat(80)}`);
  
  if (!candles || candles.length < 15) {
    return {
      isTrending: false,
      direction: null,
      strength: 0,
      consecutiveCandles: 0,
      volumeTrend: 'FLAT',
      priceVsMA: 'NEUTRAL',
      higherLowsConfirmed: false,
      lowerHighsConfirmed: false,
      ma10: 0,
      currentPrice: 0,
      notes: '❌ Dados insuficientes para validação de tendência',
      detailedAnalysis: ['Menos de 15 velas disponíveis']
    };
  }
  
  const recentCandles = candles.slice(-15);
  const last5 = recentCandles.slice(-5);
  const currentPrice = recentCandles[recentCandles.length - 1].close;
  const ma10 = calculateSMA(recentCandles, 10);
  
  const detailedAnalysis: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDAÇÃO PARA TENDÊNCIA BULLISH (BUY)
  // ═══════════════════════════════════════════════════════════════════════════
  if (expectedDirection === 'BUY') {
    console.log(`\n📊 Analisando critérios para TENDÊNCIA BULLISH...`);
    
    // CRITÉRIO 1: Pelo menos 3 das últimas 5 velas verdes
    const bullishCount = last5.filter(c => c.close > c.open).length;
    const criterion1 = bullishCount >= 3;
    console.log(`   ${criterion1 ? '✅' : '❌'} Critério 1: Velas verdes (${bullishCount}/5) - Requer >= 3`);
    detailedAnalysis.push(`Velas verdes: ${bullishCount}/5 ${criterion1 ? '✅' : '❌'}`);
    
    // CRITÉRIO 2: Higher Lows (mínimos ascendentes)
    const higherLows = validateHigherLows(recentCandles);
    console.log(`   ${higherLows ? '✅' : '❌'} Critério 2: Higher Lows (mínimos ascendentes)`);
    detailedAnalysis.push(`Higher Lows: ${higherLows ? 'Confirmado ✅' : 'Negado ❌'}`);
    
    // CRITÉRIO 3: Higher Highs (máximos ascendentes)
    const higherHighs = validateHigherHighs(recentCandles);
    console.log(`   ${higherHighs ? '✅' : '❌'} Critério 3: Higher Highs (máximos ascendentes)`);
    detailedAnalysis.push(`Higher Highs: ${higherHighs ? 'Confirmado ✅' : 'Negado ❌'}`);
    
    // CRITÉRIO 4: Volume crescente
    const volumeTrend = analyzeVolumeTrend(recentCandles, 'BUY');
    const criterion4 = volumeTrend === 'INCREASING';
    console.log(`   ${criterion4 ? '✅' : '❌'} Critério 4: Volume crescente (${volumeTrend})`);
    detailedAnalysis.push(`Volume: ${volumeTrend} ${criterion4 ? '✅' : '❌'}`);
    
    // CRITÉRIO 5: Preço acima da MA10
    const priceAboveMA = currentPrice > ma10;
    const priceVsMA = priceAboveMA ? 'ABOVE' : 'BELOW';
    const maDistance = ((currentPrice - ma10) / ma10 * 100).toFixed(3);
    console.log(`   ${priceAboveMA ? '✅' : '❌'} Critério 5: Preço vs MA10`);
    console.log(`      └─ Preço: ${currentPrice.toFixed(8)}`);
    console.log(`      └─ MA10:  ${ma10.toFixed(8)}`);
    console.log(`      └─ Distância: ${maDistance}%`);
    detailedAnalysis.push(`Preço vs MA10: ${maDistance}% ${priceAboveMA ? '(acima) ✅' : '(abaixo) ❌'}`);
    
    // DECISÃO FINAL
    const isValid = criterion1 && higherLows && higherHighs && criterion4 && priceAboveMA;
    const strength = (
      (criterion1 ? 20 : 0) +
      (higherLows ? 20 : 0) +
      (higherHighs ? 20 : 0) +
      (criterion4 ? 20 : 0) +
      (priceAboveMA ? 20 : 0)
    );
    
    console.log(`\n${isValid ? '✅ TENDÊNCIA BULLISH CONFIRMADA!' : '❌ TENDÊNCIA BULLISH NÃO CONFIRMADA'}`);
    console.log(`   └─ Força da tendência: ${strength}%`);
    console.log(`${'='.repeat(80)}\n`);
    
    return {
      isTrending: isValid,
      direction: isValid ? 'BUY' : null,
      strength,
      consecutiveCandles: bullishCount,
      volumeTrend,
      priceVsMA,
      higherLowsConfirmed: higherLows,
      lowerHighsConfirmed: false,
      ma10,
      currentPrice,
      notes: isValid 
        ? `✅ Tendência bullish confirmada (${strength}% força)`
        : `❌ Tendência bullish não confirmada - Critérios não atendidos`,
      detailedAnalysis
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDAÇÃO PARA TENDÊNCIA BEARISH (SELL)
  // ═══════════════════════════════════════════════════════════════════════════
  if (expectedDirection === 'SELL') {
    console.log(`\n📊 Analisando critérios para TENDÊNCIA BEARISH...`);
    
    // CRITÉRIO 1: Pelo menos 3 das últimas 5 velas vermelhas
    const bearishCount = last5.filter(c => c.close < c.open).length;
    const criterion1 = bearishCount >= 3;
    console.log(`   ${criterion1 ? '✅' : '❌'} Critério 1: Velas vermelhas (${bearishCount}/5) - Requer >= 3`);
    detailedAnalysis.push(`Velas vermelhas: ${bearishCount}/5 ${criterion1 ? '✅' : '❌'}`);
    
    // CRITÉRIO 2: Lower Highs (máximos descendentes)
    const lowerHighs = validateLowerHighs(recentCandles);
    console.log(`   ${lowerHighs ? '✅' : '❌'} Critério 2: Lower Highs (máximos descendentes)`);
    detailedAnalysis.push(`Lower Highs: ${lowerHighs ? 'Confirmado ✅' : 'Negado ❌'}`);
    
    // CRITÉRIO 3: Lower Lows (mínimos descendentes)
    const lowerLows = validateLowerLows(recentCandles);
    console.log(`   ${lowerLows ? '✅' : '❌'} Critério 3: Lower Lows (mínimos descendentes)`);
    detailedAnalysis.push(`Lower Lows: ${lowerLows ? 'Confirmado ✅' : 'Negado ❌'}`);
    
    // CRITÉRIO 4: Volume (aceitamos qualquer tendência para bearish)
    const volumeTrend = analyzeVolumeTrend(recentCandles, 'SELL');
    const criterion4 = volumeTrend !== 'DECREASING'; // Não queremos volume decrescente
    console.log(`   ${criterion4 ? '✅' : '❌'} Critério 4: Volume adequado (${volumeTrend})`);
    detailedAnalysis.push(`Volume: ${volumeTrend} ${criterion4 ? '✅' : '❌'}`);
    
    // CRITÉRIO 5: Preço abaixo da MA10
    const priceBelowMA = currentPrice < ma10;
    const priceVsMA = priceBelowMA ? 'BELOW' : 'ABOVE';
    const maDistance = ((currentPrice - ma10) / ma10 * 100).toFixed(3);
    console.log(`   ${priceBelowMA ? '✅' : '❌'} Critério 5: Preço vs MA10`);
    console.log(`      └─ Preço: ${currentPrice.toFixed(8)}`);
    console.log(`      └─ MA10:  ${ma10.toFixed(8)}`);
    console.log(`      └─ Distância: ${maDistance}%`);
    detailedAnalysis.push(`Preço vs MA10: ${maDistance}% ${priceBelowMA ? '(abaixo) ✅' : '(acima) ❌'}`);
    
    // DECISÃO FINAL
    const isValid = criterion1 && lowerHighs && lowerLows && criterion4 && priceBelowMA;
    const strength = (
      (criterion1 ? 20 : 0) +
      (lowerHighs ? 20 : 0) +
      (lowerLows ? 20 : 0) +
      (criterion4 ? 20 : 0) +
      (priceBelowMA ? 20 : 0)
    );
    
    console.log(`\n${isValid ? '✅ TENDÊNCIA BEARISH CONFIRMADA!' : '❌ TENDÊNCIA BEARISH NÃO CONFIRMADA'}`);
    console.log(`   └─ Força da tendência: ${strength}%`);
    console.log(`${'='.repeat(80)}\n`);
    
    return {
      isTrending: isValid,
      direction: isValid ? 'SELL' : null,
      strength,
      consecutiveCandles: bearishCount,
      volumeTrend,
      priceVsMA,
      higherLowsConfirmed: false,
      lowerHighsConfirmed: lowerHighs,
      ma10,
      currentPrice,
      notes: isValid 
        ? `✅ Tendência bearish confirmada (${strength}% força)`
        : `❌ Tendência bearish não confirmada - Critérios não atendidos`,
      detailedAnalysis
    };
  }
  
  // Fallback
  return {
    isTrending: false,
    direction: null,
    strength: 0,
    consecutiveCandles: 0,
    volumeTrend: 'FLAT',
    priceVsMA: 'NEUTRAL',
    higherLowsConfirmed: false,
    lowerHighsConfirmed: false,
    ma10,
    currentPrice,
    notes: '❌ Direção inválida',
    detailedAnalysis: ['Direção de tendência não reconhecida']
  };
}
