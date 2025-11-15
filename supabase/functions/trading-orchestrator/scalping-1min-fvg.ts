/**
 * MÓDULO DE DETECÇÃO DE FAIR VALUE GAP (FVG) - SCALPING 1 MINUTO
 * 
 * Detecta padrões de Fair Value Gap no timeframe de 1 minuto.
 * FVG é formado por 3 velas onde a vela do meio cria um "gap" entre os pavios da primeira e terceira velas.
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FVGResult {
  fvgDetected: boolean;
  direction: 'BUY' | 'SELL' | null;
  fvgTop: number;
  fvgBottom: number;
  candles: [Candle, Candle, Candle] | null;
  breakoutConfirmed: boolean;
  fvgZoneSize: number;
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
 * Valida se a 3ª vela é "expressiva" conforme PDF
 * Critério: Volume >= 1.5x média OU Corpo >= 2x média
 */
function isExpressiveCandle(candle: Candle, avgVolume: number, avgBodySize: number): boolean {
  const bodySize = Math.abs(candle.close - candle.open);
  const volumeRatio = candle.volume / avgVolume;
  const bodySizeRatio = bodySize / avgBodySize;
  
  const isExpressive = volumeRatio >= 1.5 || bodySizeRatio >= 2.0;
  
  console.log(`   🔍 Validação Vela Expressiva:`);
  console.log(`      ├─ Volume: ${candle.volume.toFixed(2)} (${volumeRatio.toFixed(2)}x média)`);
  console.log(`      ├─ Corpo: ${bodySize.toFixed(5)} (${bodySizeRatio.toFixed(2)}x média)`);
  console.log(`      └─ Expressiva: ${isExpressive ? '✅ SIM' : '❌ NÃO'}`);
  
  return isExpressive;
}

/**
 * Detecta Fair Value Gap (FVG) com confirmação de breakout E vela expressiva
 */
export function detectFVG(
  candles1m: Candle[],
  foundationHigh: number,
  foundationLow: number
): FVGResult {
  if (!candles1m || candles1m.length < 3) {
    return {
      fvgDetected: false,
      direction: null,
      fvgTop: 0,
      fvgBottom: 0,
      candles: null,
      breakoutConfirmed: false,
      fvgZoneSize: 0,
      expressiveCandleConfirmed: false
    };
  }
  
  // Calcular médias para validação de vela expressiva
  const { avgVolume, avgBodySize } = calculateAverages(candles1m, 20);
  
  // Iterar sobre as últimas 20 velas procurando padrão FVG
  const startIndex = Math.max(0, candles1m.length - 20);
  
  for (let i = startIndex; i < candles1m.length - 2; i++) {
    const candle1 = candles1m[i];     // Primeira vela
    const candle2 = candles1m[i + 1]; // Vela do meio (movimento agressivo)
    const candle3 = candles1m[i + 2]; // Terceira vela
    
    // Detectar FVG BULLISH (para operação de COMPRA)
    const bullishFVG = detectBullishFVG(candle1, candle2, candle3);
    if (bullishFVG.detected) {
      // Verificar se houve breakout do foundationHigh
      const breakoutConfirmed = checkBreakoutConfirmation(
        [candle1, candle2, candle3],
        foundationHigh,
        'BUY'
      );
      
      if (breakoutConfirmed) {
        // NOVO: Validar se a 3ª vela é expressiva
        const expressiveConfirmed = isExpressiveCandle(candle3, avgVolume, avgBodySize);
        
        console.log(`\n📈 FVG BULLISH DETECTADO:`);
        console.log(`├─ FVG Top: ${bullishFVG.fvgTop}`);
        console.log(`├─ FVG Bottom: ${bullishFVG.fvgBottom}`);
        console.log(`├─ Gap Size: ${bullishFVG.gapSize}`);
        console.log(`├─ Foundation High: ${foundationHigh}`);
        console.log(`├─ Breakout: ✅ CONFIRMADO`);
        console.log(`└─ Vela Expressiva: ${expressiveConfirmed ? '✅ CONFIRMADA' : '❌ NÃO CONFIRMADA'}`);
        
        // Só retorna sinal válido se AMBOS breakout E vela expressiva forem confirmados
        if (expressiveConfirmed) {
          return {
            fvgDetected: true,
            direction: 'BUY',
            fvgTop: bullishFVG.fvgTop,
            fvgBottom: bullishFVG.fvgBottom,
            candles: [candle1, candle2, candle3],
            breakoutConfirmed: true,
            fvgZoneSize: bullishFVG.gapSize,
            expressiveCandleConfirmed: true
          };
        }
      }
    }
    
    // Detectar FVG BEARISH (para operação de VENDA)
    const bearishFVG = detectBearishFVG(candle1, candle2, candle3);
    if (bearishFVG.detected) {
      // Verificar se houve breakout do foundationLow
      const breakoutConfirmed = checkBreakoutConfirmation(
        [candle1, candle2, candle3],
        foundationLow,
        'SELL'
      );
      
      if (breakoutConfirmed) {
        // NOVO: Validar se a 3ª vela é expressiva
        const expressiveConfirmed = isExpressiveCandle(candle3, avgVolume, avgBodySize);
        
        console.log(`\n📉 FVG BEARISH DETECTADO:`);
        console.log(`├─ FVG Top: ${bearishFVG.fvgTop}`);
        console.log(`├─ FVG Bottom: ${bearishFVG.fvgBottom}`);
        console.log(`├─ Gap Size: ${bearishFVG.gapSize}`);
        console.log(`├─ Foundation Low: ${foundationLow}`);
        console.log(`├─ Breakout: ✅ CONFIRMADO`);
        console.log(`└─ Vela Expressiva: ${expressiveConfirmed ? '✅ CONFIRMADA' : '❌ NÃO CONFIRMADA'}`);
        
        // Só retorna sinal válido se AMBOS breakout E vela expressiva forem confirmados
        if (expressiveConfirmed) {
          return {
            fvgDetected: true,
            direction: 'SELL',
            fvgTop: bearishFVG.fvgTop,
            fvgBottom: bearishFVG.fvgBottom,
            candles: [candle1, candle2, candle3],
            breakoutConfirmed: true,
            fvgZoneSize: bearishFVG.gapSize,
            expressiveCandleConfirmed: true
          };
        }
      }
    }
  }
  
  return {
    fvgDetected: false,
    direction: null,
    fvgTop: 0,
    fvgBottom: 0,
    candles: null,
    breakoutConfirmed: false,
    fvgZoneSize: 0,
    expressiveCandleConfirmed: false
  };
}

/**
 * Detecta FVG Bullish (para operações de compra)
 */
function detectBullishFVG(candle1: Candle, candle2: Candle, candle3: Candle) {
  // Para FVG Bullish:
  // - Candle 2 deve ser fortemente bullish
  // - Deve haver gap entre HIGH de Candle 1 e LOW de Candle 3
  
  const gapExists = candle1.high < candle3.low;
  const candle2IsBullish = candle2.close > candle2.open;
  const strongMove = (candle2.high - candle2.low) > (candle1.high - candle1.low) * 0.5;
  
  if (gapExists && candle2IsBullish && strongMove) {
    return {
      detected: true,
      fvgBottom: candle1.high,
      fvgTop: candle3.low,
      gapSize: candle3.low - candle1.high
    };
  }
  
  return { detected: false, fvgBottom: 0, fvgTop: 0, gapSize: 0 };
}

/**
 * Detecta FVG Bearish (para operações de venda)
 */
function detectBearishFVG(candle1: Candle, candle2: Candle, candle3: Candle) {
  // Para FVG Bearish:
  // - Candle 2 deve ser fortemente bearish
  // - Deve haver gap entre LOW de Candle 1 e HIGH de Candle 3
  
  const gapExists = candle1.low > candle3.high;
  const candle2IsBearish = candle2.close < candle2.open;
  const strongMove = (candle2.high - candle2.low) > (candle1.high - candle1.low) * 0.5;
  
  if (gapExists && candle2IsBearish && strongMove) {
    return {
      detected: true,
      fvgTop: candle1.low,
      fvgBottom: candle3.high,
      gapSize: candle1.low - candle3.high
    };
  }
  
  return { detected: false, fvgBottom: 0, fvgTop: 0, gapSize: 0 };
}

/**
 * Verifica se pelo menos uma das 3 velas fechou além do nível de fundação
 * REGRA CRÍTICA: Esta confirmação é OBRIGATÓRIA para validar o FVG
 */
function checkBreakoutConfirmation(
  candles: Candle[],
  foundationLevel: number,
  direction: 'BUY' | 'SELL'
): boolean {
  for (const candle of candles) {
    if (direction === 'BUY') {
      // Para BUY, pelo menos uma vela deve ter FECHADO acima do foundation high
      if (candle.close > foundationLevel) {
        console.log(`✅ Breakout confirmado: Vela fechou em ${candle.close} (acima de ${foundationLevel})`);
        return true;
      }
    } else {
      // Para SELL, pelo menos uma vela deve ter FECHADO abaixo do foundation low
      if (candle.close < foundationLevel) {
        console.log(`✅ Breakout confirmado: Vela fechou em ${candle.close} (abaixo de ${foundationLevel})`);
        return true;
      }
    }
  }
  
  console.log(`❌ Breakout NÃO confirmado: Nenhuma vela fechou além de ${foundationLevel}`);
  return false;
}
