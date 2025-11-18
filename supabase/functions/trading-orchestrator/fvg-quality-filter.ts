// ============================================
// FVG QUALITY FILTER
// ============================================
// Filtra FVGs de alta qualidade baseado em critérios do PDF

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { FVGResult } from './fvg-detector.ts';
import { BOSResult, MSSResult, detectBOS, detectMSS } from './fvg-structure-detector.ts';

export interface QualityScore {
  total: number;
  inKillzone: boolean;
  hasBOSorMSS: boolean;
  nonMitigated: boolean;
  atExtreme: boolean;
}

/**
 * Verifica se FVG está em Killzone
 * Londres: 02:00-05:00 UTC
 * NY: 12:00-15:00 UTC
 */
export function isInKillzone(timestamp: number): boolean {
  const date = new Date(timestamp);
  const utcHour = date.getUTCHours();
  
  // Londres Killzone: 02:00-05:00 UTC
  const inLondonKillzone = utcHour >= 2 && utcHour < 5;
  
  // NY Killzone: 12:00-15:00 UTC
  const inNYKillzone = utcHour >= 12 && utcHour < 15;
  
  return inLondonKillzone || inNYKillzone;
}

/**
 * Verifica se FVG foi formado durante BOS ou MSS
 */
export function hasBOSorMSS(
  fvg: FVGResult,
  candles: Candle[]
): boolean {
  // Pegar candles ao redor da formação do FVG
  const fvgIndex = candles.findIndex(c => c.timestamp === fvg.timestamp);
  if (fvgIndex === -1) return false;
  
  const startIndex = Math.max(0, fvgIndex - 10);
  const endIndex = Math.min(candles.length - 1, fvgIndex + 5);
  const relevantCandles = candles.slice(startIndex, endIndex + 1);
  
  // Verificar BOS
  const bosResult = detectBOS(relevantCandles);
  if (bosResult.detected) {
    console.log(`✅ FVG formado durante BOS ${bosResult.direction}`);
    return true;
  }
  
  // Verificar MSS
  const mssResult = detectMSS(relevantCandles);
  if (mssResult.detected) {
    console.log(`✅ FVG formado durante MSS ${mssResult.direction}`);
    return true;
  }
  
  return false;
}

/**
 * Verifica se FVG está em extremo de mercado (Premium/Discount zone)
 * Usa swing highs/lows recentes para determinar
 */
export function isAtMarketExtreme(
  fvg: FVGResult,
  candles: Candle[],
  lookback: number = 50
): boolean {
  if (!candles || candles.length < lookback) return false;
  
  const recentCandles = candles.slice(-lookback);
  const highest = Math.max(...recentCandles.map(c => c.high));
  const lowest = Math.min(...recentCandles.map(c => c.low));
  const range = highest - lowest;
  
  if (range === 0) return false;
  
  const fvgMid = fvg.ce;
  const position = (fvgMid - lowest) / range;
  
  if (fvg.type === 'BISI') {
    // FVG de alta em zona de desconto (30% inferior)
    return position <= 0.3;
  } else {
    // FVG de baixa em zona de premium (30% superior)
    return position >= 0.7;
  }
}

/**
 * Calcula score de qualidade do FVG
 */
export function calculateQualityScore(
  fvg: FVGResult,
  candles: Candle[]
): QualityScore {
  const inKillzone = isInKillzone(fvg.timestamp);
  const hasBOSorMSSDetected = hasBOSorMSS(fvg, candles);
  const nonMitigated = !fvg.isMitigated;
  const atExtreme = isAtMarketExtreme(fvg, candles);
  
  let total = 0;
  if (inKillzone) total++;
  if (hasBOSorMSSDetected) total++;
  if (nonMitigated) total++;
  if (atExtreme) total++;
  
  return {
    total,
    inKillzone,
    hasBOSorMSS: hasBOSorMSSDetected,
    nonMitigated,
    atExtreme,
  };
}

/**
 * Filtra apenas FVGs de alta qualidade (score >= 3)
 */
export function filterHighQualityFVGs(
  fvgs: FVGResult[],
  candles15m: Candle[],
  minScore: number = 3
): Array<{ fvg: FVGResult; score: QualityScore }> {
  const qualityFVGs: Array<{ fvg: FVGResult; score: QualityScore }> = [];
  
  for (const fvg of fvgs) {
    const score = calculateQualityScore(fvg, candles15m);
    
    if (score.total >= minScore) {
      console.log(`⭐ FVG de ALTA QUALIDADE (score: ${score.total}/4)`);
      console.log(`   Killzone: ${score.inKillzone ? '✅' : '❌'}`);
      console.log(`   BOS/MSS: ${score.hasBOSorMSS ? '✅' : '❌'}`);
      console.log(`   Não-mitigado: ${score.nonMitigated ? '✅' : '❌'}`);
      console.log(`   Extremo: ${score.atExtreme ? '✅' : '❌'}`);
      
      qualityFVGs.push({ fvg, score });
    }
  }
  
  return qualityFVGs;
}
