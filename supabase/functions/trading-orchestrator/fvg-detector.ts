// ============================================
// FVG DETECTOR - Fair Value Gap Detection
// ============================================
// Detecta FVGs (BISI e CIBI) em arrays de candles

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FVGResult {
  type: 'BISI' | 'CIBI'; // Bullish or Bearish FVG
  candle1: Candle;
  candle2: Candle;
  candle3: Candle;
  premiumHigh: number; // Topo do FVG
  discountLow: number; // Base do FVG
  ce: number; // Consequent Encroachment (50%)
  timestamp: number;
  isMitigated: boolean;
  formationIndex: number; // Index no array de candles
}

/**
 * Detecta FVGs (Fair Value Gaps) em um array de candles
 * BISI (Bullish): Pavio superior C1 < Pavio inferior C3
 * CIBI (Bearish): Pavio inferior C1 > Pavio superior C3
 */
export function detectFVG(candles: Candle[]): FVGResult[] {
  const fvgs: FVGResult[] = [];
  
  if (!candles || candles.length < 3) {
    return fvgs;
  }
  
  // Percorrer candles em grupos de 3
  for (let i = 0; i <= candles.length - 3; i++) {
    const c1 = candles[i];
    const c2 = candles[i + 1];
    const c3 = candles[i + 2];
    
    // BISI (Bullish FVG): Pavio superior C1 < Pavio inferior C3
    if (c1.high < c3.low) {
      const premiumHigh = c3.low;
      const discountLow = c1.high;
      const ce = (premiumHigh + discountLow) / 2;
      
      fvgs.push({
        type: 'BISI',
        candle1: c1,
        candle2: c2,
        candle3: c3,
        premiumHigh,
        discountLow,
        ce,
        timestamp: c3.timestamp,
        isMitigated: false,
        formationIndex: i + 2,
      });
      
      console.log(`📈 BISI FVG detectado:`);
      console.log(`   Gap: ${discountLow.toFixed(2)} - ${premiumHigh.toFixed(2)}`);
      console.log(`   CE: ${ce.toFixed(2)}`);
      console.log(`   Time: ${new Date(c3.timestamp).toISOString()}`);
    }
    
    // CIBI (Bearish FVG): Pavio inferior C1 > Pavio superior C3
    if (c1.low > c3.high) {
      const premiumHigh = c1.low;
      const discountLow = c3.high;
      const ce = (premiumHigh + discountLow) / 2;
      
      fvgs.push({
        type: 'CIBI',
        candle1: c1,
        candle2: c2,
        candle3: c3,
        premiumHigh,
        discountLow,
        ce,
        timestamp: c3.timestamp,
        isMitigated: false,
        formationIndex: i + 2,
      });
      
      console.log(`📉 CIBI FVG detectado:`);
      console.log(`   Gap: ${discountLow.toFixed(2)} - ${premiumHigh.toFixed(2)}`);
      console.log(`   CE: ${ce.toFixed(2)}`);
      console.log(`   Time: ${new Date(c3.timestamp).toISOString()}`);
    }
  }
  
  return fvgs;
}

/**
 * Verifica se FVGs foram mitigados (preço retornou ao gap)
 */
export function checkMitigation(fvgs: FVGResult[], candles: Candle[]): FVGResult[] {
  return fvgs.map(fvg => {
    // Pegar candles após a formação do FVG
    const candlesAfter = candles.filter(c => c.timestamp > fvg.timestamp);
    
    for (const candle of candlesAfter) {
      if (fvg.type === 'BISI') {
        // FVG de alta é mitigado se preço retorna ao gap
        if (candle.low <= fvg.premiumHigh && candle.low >= fvg.discountLow) {
          return { ...fvg, isMitigated: true };
        }
      } else {
        // FVG de baixa é mitigado se preço retorna ao gap
        if (candle.high >= fvg.discountLow && candle.high <= fvg.premiumHigh) {
          return { ...fvg, isMitigated: true };
        }
      }
    }
    
    return fvg;
  });
}

/**
 * Retorna apenas FVGs não-mitigados
 */
export function getNonMitigatedFVGs(fvgs: FVGResult[]): FVGResult[] {
  return fvgs.filter(fvg => !fvg.isMitigated);
}
