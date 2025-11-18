// ============================================
// FVG MULTI-TIMEFRAME STRATEGY ANALYZER
// ============================================
// Análise 15m → Execução 1m com FVG + Liquidity Sweep

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { detectFVG, checkMitigation, getNonMitigatedFVGs, FVGResult } from './fvg-detector.ts';
import { filterHighQualityFVGs } from './fvg-quality-filter.ts';
import { detectLiquiditySweep, SweepResult } from './fvg-liquidity-sweep.ts';
import { detectBOS, identifyTrend, findSwingPoints } from './fvg-structure-detector.ts';
import { detectIFVG, IFVGResult } from './fvg-ifvg-detector.ts';

export interface AnalysisParams {
  candles15m: Candle[];
  candles1m: Candle[];
  asset: string;
  userId: string;
  supabase: any;
}

export interface AnalysisResult {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  direction: 'BUY' | 'SELL' | null;
  confidence: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  notes: string;
  marketData: {
    trend15m: string;
    fvg15m?: FVGResult;
    sweep1m?: SweepResult;
    bos1m?: any;
    ifvg?: IFVGResult;
  };
}

/**
 * Analisa estratégia FVG Multi-Timeframe
 * 
 * SETUP DE COMPRA (BISI + Liquidity Sweep):
 * 1. HTF 15m: Tendência de alta clara
 * 2. Varredura de liquidez: Sweep de swing low
 * 3. LTF 1m: FVG de Alta aparece após sweep
 * 4. Confirmação: BOS de alta no 1m
 * 5. Entrada: Buy Limit no CE do FVG
 * 
 * SETUP DE VENDA (IFVG + Liquidity Sweep):
 * 1. HTF 15m: Tendência de baixa
 * 2. Varredura: Sweep de swing high
 * 3. LTF 1m: FVG vira IFVG (Resistência)
 * 4. Confirmação: MSS de baixa no 1m
 * 5. Entrada: Sell Limit no CE do IFVG
 */
export async function analyzeFVGStrategy(
  params: AnalysisParams
): Promise<AnalysisResult> {
  const { candles15m, candles1m, asset, userId, supabase } = params;
  
  console.log(`\n📊 ===== FVG MULTI-TIMEFRAME STRATEGY ANALYSIS =====`);
  console.log(`Asset: ${asset}`);
  console.log(`Candles 15m: ${candles15m.length}`);
  console.log(`Candles 1m: ${candles1m.length}`);
  
  // ============================================
  // PASSO 1: Análise HTF 15m - Tendência
  // ============================================
  console.log(`\n🔍 PASSO 1: Analisando tendência no 15m...`);
  
  const trend15m = identifyTrend(candles15m);
  console.log(`   Tendência 15m: ${trend15m}`);
  
  if (trend15m === 'NEUTRAL') {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      notes: 'Tendência neutra no 15m. Aguardando definição de direção.',
      marketData: { trend15m },
    };
  }
  
  // ============================================
  // PASSO 2: Detectar FVGs de Alta Qualidade no 15m
  // ============================================
  console.log(`\n🔍 PASSO 2: Detectando FVGs no 15m...`);
  
  const allFVGs15m = detectFVG(candles15m);
  const fvgsWithMitigation = checkMitigation(allFVGs15m, candles15m);
  const nonMitigatedFVGs = getNonMitigatedFVGs(fvgsWithMitigation);
  
  console.log(`   Total FVGs: ${allFVGs15m.length}`);
  console.log(`   Não-mitigados: ${nonMitigatedFVGs.length}`);
  
  const qualityFVGs = filterHighQualityFVGs(nonMitigatedFVGs, candles15m, 3);
  console.log(`   Alta qualidade (score ≥3): ${qualityFVGs.length}`);
  
  if (qualityFVGs.length === 0) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      notes: 'Nenhum FVG de alta qualidade detectado no 15m.',
      marketData: { trend15m },
    };
  }
  
  // Pegar o FVG mais recente de alta qualidade
  const latestQualityFVG = qualityFVGs[qualityFVGs.length - 1];
  const fvg15m = latestQualityFVG.fvg;
  
  console.log(`   ✅ FVG selecionado: ${fvg15m.type} em ${new Date(fvg15m.timestamp).toISOString()}`);
  console.log(`      Range: ${fvg15m.discountLow.toFixed(2)} - ${fvg15m.premiumHigh.toFixed(2)}`);
  console.log(`      CE: ${fvg15m.ce.toFixed(2)}`);
  
  // ============================================
  // PASSO 3: Detectar Liquidity Sweep no 1m
  // ============================================
  console.log(`\n🔍 PASSO 3: Detectando Liquidity Sweep no 1m...`);
  
  const sweep1m = detectLiquiditySweep(candles1m);
  
  if (!sweep1m.detected) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      notes: 'Aguardando varredura de liquidez no 1m.',
      marketData: { trend15m, fvg15m },
    };
  }
  
  console.log(`   ✅ Sweep detectado: ${sweep1m.type}`);
  console.log(`      Swing: ${sweep1m.swingPoint?.price.toFixed(2)}`);
  console.log(`      Wick: ${(sweep1m.wickPercentage * 100).toFixed(1)}%`);
  
  // ============================================
  // PASSO 4: Confirmar FVG + BOS no 1m (SETUP DE COMPRA)
  // ============================================
  if (trend15m === 'BULLISH' && sweep1m.type === 'SELL_SIDE') {
    console.log(`\n🔍 PASSO 4A: Setup de COMPRA (BISI + Sweep)...`);
    
    // Detectar FVGs no 1m após o sweep
    const candlesAfterSweep = candles1m.filter(c => c.timestamp > sweep1m.timestamp);
    const fvgs1m = detectFVG(candlesAfterSweep);
    
    // Procurar FVG de Alta (BISI)
    const bullishFVGs = fvgs1m.filter(f => f.type === 'BISI');
    
    if (bullishFVGs.length === 0) {
      return {
        signal: 'STAY_OUT',
        direction: null,
        confidence: 0,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        notes: 'Aguardando FVG de Alta no 1m após sweep.',
        marketData: { trend15m, fvg15m, sweep1m },
      };
    }
    
    const fvg1m = bullishFVGs[0]; // Primeiro FVG de alta após sweep
    
    // Confirmar BOS de alta
    const bos1m = detectBOS(candlesAfterSweep);
    
    if (!bos1m.detected || bos1m.direction !== 'BULLISH') {
      return {
        signal: 'STAY_OUT',
        direction: null,
        confidence: 0,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        notes: 'Aguardando BOS de alta no 1m para confirmar entrada.',
        marketData: { trend15m, fvg15m, sweep1m },
      };
    }
    
    console.log(`   ✅ BOS de alta confirmado!`);
    
    // ============================================
    // PASSO 5: Calcular Entrada, SL e TP (COMPRA)
    // ============================================
    const entryPrice = fvg1m.ce; // Entrada no CE do FVG
    const stopLoss = sweep1m.swingPoint!.price - (sweep1m.swingPoint!.price * 0.001); // SL abaixo do swing low
    const riskPerTrade = Math.abs(entryPrice - stopLoss);
    const takeProfit = entryPrice + (riskPerTrade * 2.5); // RR 2.5:1
    const riskReward = 2.5;
    
    console.log(`\n✅ ===== SINAL DE COMPRA GERADO =====`);
    console.log(`   Entrada: ${entryPrice.toFixed(2)}`);
    console.log(`   Stop Loss: ${stopLoss.toFixed(2)}`);
    console.log(`   Take Profit: ${takeProfit.toFixed(2)}`);
    console.log(`   Risk/Reward: ${riskReward}:1`);
    
    return {
      signal: 'BUY',
      direction: 'BUY',
      confidence: 85,
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward,
      notes: `FVG Multi-TF: Tendência 15m ALTA + Sweep + FVG 1m + BOS confirmado. Entrada no CE ${entryPrice.toFixed(2)}, SL ${stopLoss.toFixed(2)}, TP ${takeProfit.toFixed(2)} (RR 2.5:1)`,
      marketData: { trend15m, fvg15m, sweep1m, bos1m },
    };
  }
  
  // ============================================
  // PASSO 4B: Confirmar IFVG + MSS no 1m (SETUP DE VENDA)
  // ============================================
  if (trend15m === 'BEARISH' && sweep1m.type === 'BUY_SIDE') {
    console.log(`\n🔍 PASSO 4B: Setup de VENDA (IFVG + Sweep)...`);
    
    // Detectar FVGs no 1m antes do sweep
    const candlesBeforeSweep = candles1m.filter(c => c.timestamp <= sweep1m.timestamp);
    const fvgs1mBefore = detectFVG(candlesBeforeSweep);
    
    // Procurar FVG de Alta que foi violado (virou IFVG)
    const bullishFVGs = fvgs1mBefore.filter(f => f.type === 'BISI');
    
    if (bullishFVGs.length === 0) {
      return {
        signal: 'STAY_OUT',
        direction: null,
        confidence: 0,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        notes: 'Nenhum FVG disponível para virar IFVG.',
        marketData: { trend15m, fvg15m, sweep1m },
      };
    }
    
    const candidateFVG = bullishFVGs[bullishFVGs.length - 1];
    const candlesAfterSweep = candles1m.filter(c => c.timestamp > sweep1m.timestamp);
    const ifvg = detectIFVG(candidateFVG, candlesAfterSweep);
    
    if (!ifvg.isIFVG || ifvg.newRole !== 'RESISTANCE') {
      return {
        signal: 'STAY_OUT',
        direction: null,
        confidence: 0,
        entryPrice: 0,
        stopLoss: 0,
        takeProfit: 0,
        riskReward: 0,
        notes: 'Aguardando FVG virar IFVG (Resistência).',
        marketData: { trend15m, fvg15m, sweep1m },
      };
    }
    
    console.log(`   ✅ IFVG (Resistência) confirmado!`);
    
    // ============================================
    // PASSO 5: Calcular Entrada, SL e TP (VENDA)
    // ============================================
    const entryPrice = ifvg.originalFVG.ce; // Entrada no CE do IFVG
    const stopLoss = sweep1m.swingPoint!.price + (sweep1m.swingPoint!.price * 0.001); // SL acima do swing high
    const riskPerTrade = Math.abs(stopLoss - entryPrice);
    const takeProfit = entryPrice - (riskPerTrade * 2.5); // RR 2.5:1
    const riskReward = 2.5;
    
    console.log(`\n✅ ===== SINAL DE VENDA GERADO =====`);
    console.log(`   Entrada: ${entryPrice.toFixed(2)}`);
    console.log(`   Stop Loss: ${stopLoss.toFixed(2)}`);
    console.log(`   Take Profit: ${takeProfit.toFixed(2)}`);
    console.log(`   Risk/Reward: ${riskReward}:1`);
    
    return {
      signal: 'SELL',
      direction: 'SELL',
      confidence: 85,
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward,
      notes: `FVG Multi-TF: Tendência 15m BAIXA + Sweep + IFVG 1m (Resistência). Entrada no CE ${entryPrice.toFixed(2)}, SL ${stopLoss.toFixed(2)}, TP ${takeProfit.toFixed(2)} (RR 2.5:1)`,
      marketData: { trend15m, fvg15m, sweep1m, ifvg },
    };
  }
  
  // Nenhum setup válido
  return {
    signal: 'STAY_OUT',
    direction: null,
    confidence: 0,
    entryPrice: 0,
    stopLoss: 0,
    takeProfit: 0,
    riskReward: 0,
    notes: 'Condições de entrada não atendidas. Aguardando setup completo.',
    marketData: { trend15m, fvg15m, sweep1m },
  };
}
