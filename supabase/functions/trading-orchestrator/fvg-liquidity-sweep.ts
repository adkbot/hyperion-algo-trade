// ============================================
// LIQUIDITY SWEEP DETECTOR
// ============================================
// Detecta varredura de liquidez (sweep de swing highs/lows)

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { SwingPoint, findSwingPoints } from './fvg-structure-detector.ts';

export interface SweepResult {
  detected: boolean;
  type: 'SELL_SIDE' | 'BUY_SIDE' | null; // Sell-side = sweep low, Buy-side = sweep high
  swingPoint: SwingPoint | null;
  sweepCandle: Candle | null;
  wickPercentage: number; // Porcentagem do pavio em relação ao corpo
  timestamp: number;
}

/**
 * Detecta varredura de liquidez (Liquidity Sweep)
 * 
 * Sell-Side Liquidity Sweep: Preço quebra swing low e reverte (pavio longo para baixo)
 * Buy-Side Liquidity Sweep: Preço quebra swing high e reverte (pavio longo para cima)
 */
export function detectLiquiditySweep(
  candles: Candle[],
  swingPoints?: SwingPoint[],
  wickThreshold: number = 0.6 // 60% do candle deve ser pavio
): SweepResult {
  if (!candles || candles.length < 10) {
    return {
      detected: false,
      type: null,
      swingPoint: null,
      sweepCandle: null,
      wickPercentage: 0,
      timestamp: 0,
    };
  }
  
  const swings = swingPoints || findSwingPoints(candles);
  const recentCandles = candles.slice(-30);
  
  // Procurar Sell-Side Liquidity Sweep (quebra swing low)
  const recentLows = swings.filter(s => s.type === 'LOW').slice(-3);
  if (recentLows.length > 0) {
    const targetLow = recentLows[recentLows.length - 1];
    
    for (const candle of recentCandles) {
      if (candle.timestamp <= targetLow.timestamp) continue;
      
      // Verifica se quebrou o swing low
      const brokeLow = candle.low < targetLow.price;
      
      // Verifica se fechou acima (reversão)
      const closedAbove = candle.close > targetLow.price;
      
      // Calcula tamanho do pavio inferior
      const bodySize = Math.abs(candle.close - candle.open);
      const lowerWick = Math.min(candle.open, candle.close) - candle.low;
      const totalSize = candle.high - candle.low;
      const wickPercentage = totalSize > 0 ? lowerWick / totalSize : 0;
      
      if (brokeLow && closedAbove && wickPercentage >= wickThreshold) {
        console.log(`💧 SELL-SIDE LIQUIDITY SWEEP detectado:`);
        console.log(`   Swing Low: ${targetLow.price.toFixed(2)}`);
        console.log(`   Sweep Low: ${candle.low.toFixed(2)}`);
        console.log(`   Close: ${candle.close.toFixed(2)}`);
        console.log(`   Wick %: ${(wickPercentage * 100).toFixed(1)}%`);
        
        return {
          detected: true,
          type: 'SELL_SIDE',
          swingPoint: targetLow,
          sweepCandle: candle,
          wickPercentage,
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  // Procurar Buy-Side Liquidity Sweep (quebra swing high)
  const recentHighs = swings.filter(s => s.type === 'HIGH').slice(-3);
  if (recentHighs.length > 0) {
    const targetHigh = recentHighs[recentHighs.length - 1];
    
    for (const candle of recentCandles) {
      if (candle.timestamp <= targetHigh.timestamp) continue;
      
      // Verifica se quebrou o swing high
      const brokeHigh = candle.high > targetHigh.price;
      
      // Verifica se fechou abaixo (reversão)
      const closedBelow = candle.close < targetHigh.price;
      
      // Calcula tamanho do pavio superior
      const bodySize = Math.abs(candle.close - candle.open);
      const upperWick = candle.high - Math.max(candle.open, candle.close);
      const totalSize = candle.high - candle.low;
      const wickPercentage = totalSize > 0 ? upperWick / totalSize : 0;
      
      if (brokeHigh && closedBelow && wickPercentage >= wickThreshold) {
        console.log(`💧 BUY-SIDE LIQUIDITY SWEEP detectado:`);
        console.log(`   Swing High: ${targetHigh.price.toFixed(2)}`);
        console.log(`   Sweep High: ${candle.high.toFixed(2)}`);
        console.log(`   Close: ${candle.close.toFixed(2)}`);
        console.log(`   Wick %: ${(wickPercentage * 100).toFixed(1)}%`);
        
        return {
          detected: true,
          type: 'BUY_SIDE',
          swingPoint: targetHigh,
          sweepCandle: candle,
          wickPercentage,
          timestamp: candle.timestamp,
        };
      }
    }
  }
  
  return {
    detected: false,
    type: null,
    swingPoint: null,
    sweepCandle: null,
    wickPercentage: 0,
    timestamp: 0,
  };
}

/**
 * Verifica se houve sweep recente (últimos X minutos)
 */
export function hasRecentSweep(
  candles: Candle[],
  lookbackMinutes: number = 30
): SweepResult {
  const now = Date.now();
  const lookbackMs = lookbackMinutes * 60 * 1000;
  const recentCandles = candles.filter(c => now - c.timestamp <= lookbackMs);
  
  return detectLiquiditySweep(recentCandles);
}
