// ============================================
// FVG DETECTOR - 15M TIMEFRAME
// ============================================
// Detecta Fair Value Gaps em 15 minutos
// Inclui validação de sweep antes do FVG

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FVG15mResult {
  fvgDetected: boolean;
  direction: 'BUY' | 'SELL' | null;
  fvgTop: number;
  fvgBottom: number;
  fvgMidpoint: number;
  candles: [Candle, Candle, Candle] | null;
  sweepConfirmed: boolean;
  zoneSize: number; // Tamanho do gap em preço
  timestamp: number;
}

/**
 * Detecta FVG em 15 minutos com confirmação de sweep
 */
export function detectFVG15m(
  candles15m: Candle[],
  foundationHigh: number,
  foundationLow: number
): FVG15mResult {
  
  console.log('\n🔍 Detectando FVG 15m...');
  console.log(`   Foundation: $${foundationHigh} / $${foundationLow}`);
  
  if (!candles15m || candles15m.length < 10) {
    console.log('❌ Candles 15m insuficientes');
    return createEmptyResult();
  }
  
  // Calcular médias para validação
  const avgVolume = calculateAverageVolume(candles15m);
  const avgBodySize = calculateAverageBodySize(candles15m);
  
  // Procurar padrão FVG (últimas 10 velas)
  const recentCandles = candles15m.slice(-10);
  
  for (let i = 0; i < recentCandles.length - 2; i++) {
    const candle1 = recentCandles[i];
    const candle2 = recentCandles[i + 1];
    const candle3 = recentCandles[i + 2];
    
    // Tentar detectar BULLISH FVG
    const bullishFVG = detectBullishFVG(candle1, candle2, candle3);
    if (bullishFVG) {
      // Verificar se houve sweep antes
      const sweepConfirmed = checkSweepBeforeFVG(
        recentCandles.slice(0, i + 3),
        foundationLow,
        'BUY'
      );
      
      // Validar se a 3ª vela é expressiva
      const isExpressive = isExpressiveCandle(candle3, avgVolume, avgBodySize);
      
      if (sweepConfirmed && isExpressive) {
        const fvgTop = candle3.low;
        const fvgBottom = candle1.high;
        const fvgMidpoint = (fvgTop + fvgBottom) / 2;
        
        console.log(`✅ BULLISH FVG 15m detectado!`);
        console.log(`   Zone: $${fvgBottom} - $${fvgTop}`);
        console.log(`   Entry (50%): $${fvgMidpoint}`);
        console.log(`   Sweep confirmado: ✅`);
        console.log(`   Candle expressivo: ✅`);
        
        return {
          fvgDetected: true,
          direction: 'BUY',
          fvgTop,
          fvgBottom,
          fvgMidpoint,
          candles: [candle1, candle2, candle3],
          sweepConfirmed: true,
          zoneSize: fvgTop - fvgBottom,
          timestamp: candle3.timestamp
        };
      }
    }
    
    // Tentar detectar BEARISH FVG
    const bearishFVG = detectBearishFVG(candle1, candle2, candle3);
    if (bearishFVG) {
      const sweepConfirmed = checkSweepBeforeFVG(
        recentCandles.slice(0, i + 3),
        foundationHigh,
        'SELL'
      );
      
      const isExpressive = isExpressiveCandle(candle3, avgVolume, avgBodySize);
      
      if (sweepConfirmed && isExpressive) {
        const fvgTop = candle1.low;
        const fvgBottom = candle3.high;
        const fvgMidpoint = (fvgTop + fvgBottom) / 2;
        
        console.log(`✅ BEARISH FVG 15m detectado!`);
        console.log(`   Zone: $${fvgBottom} - $${fvgTop}`);
        console.log(`   Entry (50%): $${fvgMidpoint}`);
        console.log(`   Sweep confirmado: ✅`);
        console.log(`   Candle expressivo: ✅`);
        
        return {
          fvgDetected: true,
          direction: 'SELL',
          fvgTop,
          fvgBottom,
          fvgMidpoint,
          candles: [candle1, candle2, candle3],
          sweepConfirmed: true,
          zoneSize: fvgTop - fvgBottom,
          timestamp: candle3.timestamp
        };
      }
    }
  }
  
  console.log('❌ Nenhum FVG 15m válido encontrado');
  return createEmptyResult();
}

/**
 * Detecta padrão de FVG bullish (compra)
 * Gap entre high da vela 1 e low da vela 3
 */
function detectBullishFVG(c1: Candle, c2: Candle, c3: Candle): boolean {
  // Deve haver um gap: low da vela 3 > high da vela 1
  return c3.low > c1.high;
}

/**
 * Detecta padrão de FVG bearish (venda)
 * Gap entre low da vela 1 e high da vela 3
 */
function detectBearishFVG(c1: Candle, c2: Candle, c3: Candle): boolean {
  // Deve haver um gap: high da vela 3 < low da vela 1
  return c3.high < c1.low;
}

/**
 * Verifica se houve sweep de liquidez antes da formação do FVG
 * Critérios relaxados: permite sweep parcial (não precisa reverter totalmente)
 */
function checkSweepBeforeFVG(
  candles: Candle[],
  foundationLevel: number,
  direction: 'BUY' | 'SELL'
): boolean {
  
  for (const candle of candles) {
    if (direction === 'BUY') {
      // Para compra, basta tocar abaixo do foundation low
      // Permite sweep parcial: não exige reversão completa
      if (candle.low <= foundationLevel) {
        return true;
      }
    } else {
      // Para venda, basta tocar acima do foundation high
      // Permite sweep parcial: não exige reversão completa
      if (candle.high >= foundationLevel) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Verifica se a vela é "expressiva" (alto volume e corpo grande)
 * Critérios relaxados para aumentar taxa de detecção
 */
function isExpressiveCandle(
  candle: Candle,
  avgVolume: number,
  avgBodySize: number
): boolean {
  const bodySize = Math.abs(candle.close - candle.open);
  
  // Critérios relaxados: volume 1.2x maior que média E corpo 1.15x maior
  const isHighVolume = candle.volume >= avgVolume * 1.2;
  const isLargeBody = bodySize >= avgBodySize * 1.15;
  
  return isHighVolume && isLargeBody;
}

/**
 * Calcula volume médio das últimas 20 velas
 */
function calculateAverageVolume(candles: Candle[]): number {
  const recent = candles.slice(-20);
  const sum = recent.reduce((acc, c) => acc + c.volume, 0);
  return sum / recent.length;
}

/**
 * Calcula tamanho médio do corpo das últimas 20 velas
 */
function calculateAverageBodySize(candles: Candle[]): number {
  const recent = candles.slice(-20);
  const sum = recent.reduce((acc, c) => acc + Math.abs(c.close - c.open), 0);
  return sum / recent.length;
}

/**
 * Retorna resultado vazio
 */
function createEmptyResult(): FVG15mResult {
  return {
    fvgDetected: false,
    direction: null,
    fvgTop: 0,
    fvgBottom: 0,
    fvgMidpoint: 0,
    candles: null,
    sweepConfirmed: false,
    zoneSize: 0,
    timestamp: 0
  };
}
