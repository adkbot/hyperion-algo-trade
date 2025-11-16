// ============================================
// FVG RETEST DETECTOR - 15M TIMEFRAME
// ============================================
// Detecta quando o preço retesta os 50% do FVG (Consequent Encroachment)

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FVG15m {
  fvgTop: number;
  fvgBottom: number;
  fvgMidpoint: number;
  direction: 'BUY' | 'SELL' | null;
  timestamp: number;
}

export interface FVGRetestResult {
  hasRetest: boolean;
  retestCandle: Candle | null;
  retestPrice: number;
  entryReady: boolean;
  notes: string;
}

/**
 * Detecta se o preço retestou os 50% do FVG em 15m
 * Consequent Encroachment = Retest do meio do FVG
 */
export function detectFVGRetest(
  candles15m: Candle[],
  fvg15m: FVG15m
): FVGRetestResult {
  
  console.log('\n🔍 Verificando retest 50% do FVG 15m...');
  console.log(`   FVG Midpoint (50%): $${fvg15m.fvgMidpoint}`);
  console.log(`   Direção: ${fvg15m.direction}`);
  
  if (!candles15m || candles15m.length === 0) {
    return createEmptyResult('Candles 15m insuficientes');
  }
  
  // Tolerância de ±0.2% do midpoint
  const tolerance = fvg15m.fvgMidpoint * 0.002;
  const upperBound = fvg15m.fvgMidpoint + tolerance;
  const lowerBound = fvg15m.fvgMidpoint - tolerance;
  
  console.log(`   Zona de retest: $${lowerBound} - $${upperBound}`);
  
  // Procurar velas APÓS a formação do FVG que tocaram o midpoint
  const candlesAfterFVG = candles15m.filter(c => c.timestamp > fvg15m.timestamp);
  
  if (candlesAfterFVG.length === 0) {
    return createEmptyResult('Aguardando movimento após FVG');
  }
  
  // Verificar retest baseado na direção
  for (let i = 0; i < candlesAfterFVG.length; i++) {
    const candle = candlesAfterFVG[i];
    
    if (fvg15m.direction === 'BUY') {
      // Para compra: preço deve voltar DE CIMA para o midpoint
      // (Após subir, desce para testar o meio do FVG)
      const touchedMidpoint = candle.low <= upperBound && candle.low >= lowerBound;
      const closedAbove = candle.close >= lowerBound;
      
      if (touchedMidpoint && closedAbove) {
        console.log(`✅ BULLISH RETEST 50% confirmado!`);
        console.log(`   Vela: ${new Date(candle.timestamp).toISOString()}`);
        console.log(`   Low: $${candle.low} (tocou midpoint)`);
        console.log(`   Close: $${candle.close} (fechou acima)`);
        
        return {
          hasRetest: true,
          retestCandle: candle,
          retestPrice: candle.low,
          entryReady: true,
          notes: `Retest bullish confirmado em $${candle.low}`
        };
      }
    } else if (fvg15m.direction === 'SELL') {
      // Para venda: preço deve voltar DE BAIXO para o midpoint
      // (Após cair, sobe para testar o meio do FVG)
      const touchedMidpoint = candle.high >= lowerBound && candle.high <= upperBound;
      const closedBelow = candle.close <= upperBound;
      
      if (touchedMidpoint && closedBelow) {
        console.log(`✅ BEARISH RETEST 50% confirmado!`);
        console.log(`   Vela: ${new Date(candle.timestamp).toISOString()}`);
        console.log(`   High: $${candle.high} (tocou midpoint)`);
        console.log(`   Close: $${candle.close} (fechou abaixo)`);
        
        return {
          hasRetest: true,
          retestCandle: candle,
          retestPrice: candle.high,
          entryReady: true,
          notes: `Retest bearish confirmado em $${candle.high}`
        };
      }
    }
  }
  
  console.log('⏳ Aguardando retest do midpoint (50% FVG)');
  
  return createEmptyResult('Aguardando preço retornar para 50% do FVG');
}

/**
 * Cria resultado vazio
 */
function createEmptyResult(notes: string): FVGRetestResult {
  return {
    hasRetest: false,
    retestCandle: null,
    retestPrice: 0,
    entryReady: false,
    notes
  };
}
