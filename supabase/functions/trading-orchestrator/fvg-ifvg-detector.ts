// ============================================
// IFVG DETECTOR - Inverse FVG Detection
// ============================================
// Detecta quando um FVG foi violado e se tornou uma zona de reversão

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { FVGResult } from './fvg-detector.ts';

export interface IFVGResult {
  isIFVG: boolean;
  originalFVG: FVGResult;
  violationCandle: Candle | null;
  violationPrice: number;
  newRole: 'RESISTANCE' | 'SUPPORT' | null;
  timestamp: number;
}

/**
 * Detecta se um FVG foi violado e se tornou IFVG (Inverse FVG)
 * 
 * BISI (FVG de Alta) violado para baixo → Vira RESISTÊNCIA (IFVG)
 * CIBI (FVG de Baixa) violado para cima → Vira SUPORTE (IFVG)
 */
export function detectIFVG(
  fvg: FVGResult,
  candlesAfter: Candle[]
): IFVGResult {
  if (!candlesAfter || candlesAfter.length === 0) {
    return {
      isIFVG: false,
      originalFVG: fvg,
      violationCandle: null,
      violationPrice: 0,
      newRole: null,
      timestamp: 0,
    };
  }
  
  // Filtrar apenas candles APÓS a formação do FVG
  const validCandles = candlesAfter.filter(c => c.timestamp > fvg.timestamp);
  
  if (fvg.type === 'BISI') {
    // FVG de Alta violado para BAIXO (close abaixo do discountLow)
    for (const candle of validCandles) {
      if (candle.close < fvg.discountLow) {
        console.log(`🔄 IFVG detectado: BISI virou RESISTÊNCIA`);
        console.log(`   FVG Original: ${fvg.discountLow.toFixed(2)} - ${fvg.premiumHigh.toFixed(2)}`);
        console.log(`   Violação em: ${candle.close.toFixed(2)}`);
        
        return {
          isIFVG: true,
          originalFVG: fvg,
          violationCandle: candle,
          violationPrice: candle.close,
          newRole: 'RESISTANCE',
          timestamp: candle.timestamp,
        };
      }
    }
  } else if (fvg.type === 'CIBI') {
    // FVG de Baixa violado para CIMA (close acima do premiumHigh)
    for (const candle of validCandles) {
      if (candle.close > fvg.premiumHigh) {
        console.log(`🔄 IFVG detectado: CIBI virou SUPORTE`);
        console.log(`   FVG Original: ${fvg.discountLow.toFixed(2)} - ${fvg.premiumHigh.toFixed(2)}`);
        console.log(`   Violação em: ${candle.close.toFixed(2)}`);
        
        return {
          isIFVG: true,
          originalFVG: fvg,
          violationCandle: candle,
          violationPrice: candle.close,
          newRole: 'SUPPORT',
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  return {
    isIFVG: false,
    originalFVG: fvg,
    violationCandle: null,
    violationPrice: 0,
    newRole: null,
    timestamp: 0,
  };
}

/**
 * Verifica se preço está testando um IFVG (possível entrada)
 */
export function isPriceTestingIFVG(
  ifvg: IFVGResult,
  currentPrice: number,
  tolerance: number = 0.001 // 0.1% de tolerância
): boolean {
  if (!ifvg.isIFVG) return false;
  
  const fvg = ifvg.originalFVG;
  const ce = fvg.ce;
  const tolerancePrice = ce * tolerance;
  
  if (ifvg.newRole === 'RESISTANCE') {
    // Preço se aproximando da resistência (IFVG) por baixo
    return currentPrice >= ce - tolerancePrice && currentPrice <= ce + tolerancePrice;
  } else if (ifvg.newRole === 'SUPPORT') {
    // Preço se aproximando do suporte (IFVG) por cima
    return currentPrice >= ce - tolerancePrice && currentPrice <= ce + tolerancePrice;
  }
  
  return false;
}

/**
 * Filtra apenas IFVGs válidos para trade
 */
export function getValidIFVGs(
  fvgs: FVGResult[],
  candlesAfter: Candle[]
): IFVGResult[] {
  const ifvgs: IFVGResult[] = [];
  
  for (const fvg of fvgs) {
    const ifvg = detectIFVG(fvg, candlesAfter);
    if (ifvg.isIFVG) {
      ifvgs.push(ifvg);
    }
  }
  
  return ifvgs;
}
