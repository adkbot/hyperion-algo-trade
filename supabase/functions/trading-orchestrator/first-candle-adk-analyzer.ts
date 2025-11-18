// ============================================
// ADK STRATEGY ANALYZER - 3 PASSOS
// ============================================
// Versão simplificada: Foundation 15m → Sweep+FVG 15m → Retest 50%

import { getOrCreateFoundation15m } from './first-candle-foundation-15m.ts';
import { detectFVG15m, type FVG15mResult } from './first-candle-fvg-15m.ts';
import { detectFVGRetest } from './first-candle-fvg-retest.ts';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface AnalysisParams {
  candles: {
    '1m': Candle[];
    '15m': Candle[];
  };
  asset: string;
  userId: string;
  supabase: any;
}

export interface ADKAnalysisResult {
  signal: 'BUY' | 'SELL' | 'STAY_OUT';
  direction: 'BUY' | 'SELL' | null;
  confidence: number;
  notes: string;
  risk?: {
    entry: number;
    stop: number;
    target: number;
    rr_ratio: number;
  };
  phase: string;
  foundation?: any;
  fvg15m?: FVG15mResult;
  retest?: any;
}

// 💰 Helper para calcular níveis de risco (RR 3.0) - CORRIGIDO
function calculateRiskLevels(
  direction: 'BUY' | 'SELL',
  entryPrice: number,
  fvgTop: number,
  fvgBottom: number
) {
  let stopLoss: number;
  let takeProfit: number;

  if (direction === 'BUY') {
    // Stop ABAIXO do FVG com margem de 0.2%
    const stopBuffer = fvgBottom * 0.002; // 0.2% do preço
    stopLoss = fvgBottom - stopBuffer;    // SUBTRAIR buffer
    
    const riskDistance = entryPrice - stopLoss;
    const targetBuffer = entryPrice * 0.002; // 0.2% do entry
    takeProfit = entryPrice + (riskDistance * 3.0) + targetBuffer;
    
    console.log(`📊 BUY Risk Levels (0.2% buffer CORRETO):
      FVG Bottom: $${fvgBottom.toFixed(2)}
      Buffer: $${stopBuffer.toFixed(2)} (0.2%)
      Stop: $${stopLoss.toFixed(2)} (ABAIXO - ${fvgBottom.toFixed(2)} - ${stopBuffer.toFixed(2)})
      Entry: $${entryPrice.toFixed(2)}
      TP: $${takeProfit.toFixed(2)} (ACIMA)
      Risk Distance: $${riskDistance.toFixed(2)}
      Reward Distance: $${(riskDistance * 3.0).toFixed(2)}
    `);
  } else {
    // Stop ACIMA do FVG com margem de 0.2%
    const stopBuffer = fvgTop * 0.002; // 0.2% do preço
    stopLoss = fvgTop + stopBuffer;    // ADICIONAR buffer
    
    const riskDistance = stopLoss - entryPrice;
    const targetBuffer = entryPrice * 0.002; // 0.2% do entry
    takeProfit = entryPrice - (riskDistance * 3.0) - targetBuffer;
    
    console.log(`📊 SELL Risk Levels (0.2% buffer CORRETO):
      FVG Top: $${fvgTop.toFixed(2)}
      Buffer: $${stopBuffer.toFixed(2)} (0.2%)
      Stop: $${stopLoss.toFixed(2)} (ACIMA - ${fvgTop.toFixed(2)} + ${stopBuffer.toFixed(2)})
      Entry: $${entryPrice.toFixed(2)}
      TP: $${takeProfit.toFixed(2)} (ABAIXO)
      Risk Distance: $${riskDistance.toFixed(2)}
      Reward Distance: $${(riskDistance * 3.0).toFixed(2)}
    `);
  }

  return {
    entryPrice,
    stopLoss,
    takeProfit,
    riskReward: 3.0
  };
}

export async function analyzeADKStrategy(params: AnalysisParams): Promise<ADKAnalysisResult> {
  const { candles, asset, userId, supabase } = params;
  
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ADK STRATEGY ANALYSIS (3 STEPS)');
  console.log('   Asset:', asset);
  console.log('='.repeat(70));
  
  // PASSO 1: FOUNDATION 15M
  console.log('\n1️⃣ PASSO 1: FOUNDATION 15M');
  const foundation15m = await getOrCreateFoundation15m(candles['15m'], userId, supabase);
  
  await supabase.from('adk_strategy_state').upsert({
    user_id: userId,
    asset: asset,
    date: new Date().toISOString().split('T')[0],
    current_phase: 'ADK_STEP_1_FOUNDATION',
    foundation_data: foundation15m,
    next_action: foundation15m.isValid ? 'Aguardando Sweep + FVG em 15m' : 'Aguardando foundation 15m',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,asset,date' });
  
  if (!foundation15m.isValid) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      notes: '⏳ Aguardando foundation 15m',
      phase: 'ADK_STEP_1_FOUNDATION',
      foundation: foundation15m
    };
  }
  
  console.log(`✅ Foundation válida: $${foundation15m.high} / $${foundation15m.low}`);
  
  // PASSO 2: SWEEP + FVG 15M
  console.log('\n2️⃣ PASSO 2: SWEEP + FVG 15M');
  const fvg15m = detectFVG15m(candles['15m'], foundation15m.high, foundation15m.low);
  
  await supabase.from('adk_strategy_state').upsert({
    user_id: userId,
    asset: asset,
    date: new Date().toISOString().split('T')[0],
    current_phase: 'ADK_STEP_2_FVG_15M',
    foundation_data: foundation15m,
    fvg15m_data: fvg15m,
    next_action: fvg15m.fvgDetected ? `Aguardando retest 50%` : 'Aguardando Sweep + FVG',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,asset,date' });
  
  if (!fvg15m.fvgDetected || !fvg15m.sweepConfirmed) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 20,
      notes: '⏳ Aguardando Sweep + FVG em 15m',
      phase: 'ADK_STEP_2_FVG_15M'
    };
  }
  
  console.log(`✅ FVG 15m: ${fvg15m.direction} - Midpoint: $${fvg15m.fvgMidpoint}`);
  
  // PASSO 3: RETEST 50% - ENTRADA FINAL
  console.log('\n3️⃣ PASSO 3: RETEST 50%');
  const retestResult = detectFVGRetest(candles['15m'], {
    fvgTop: fvg15m.fvgTop,
    fvgBottom: fvg15m.fvgBottom,
    fvgMidpoint: fvg15m.fvgMidpoint,
    direction: fvg15m.direction,
    timestamp: fvg15m.timestamp
  });

  if (retestResult.hasRetest && retestResult.entryReady) {
    const direction = fvg15m.direction as 'BUY' | 'SELL';
    const risk = calculateRiskLevels(direction, retestResult.retestPrice, fvg15m.fvgTop, fvg15m.fvgBottom);
    
    console.log(`\n✅ ADK 3-STEP COMPLETO: ${direction}!`);
    console.log(`   Entry: $${risk.entryPrice.toFixed(2)} | Stop: $${risk.stopLoss.toFixed(2)} | Target: $${risk.takeProfit.toFixed(2)}`);

    await supabase.from('adk_strategy_state').upsert({
      user_id: userId,
      asset: asset,
      date: new Date().toISOString().split('T')[0],
      current_phase: 'ADK_STEP_3_ENTRY_READY',
      foundation_data: foundation15m,
      fvg15m_data: fvg15m,
      retest_data: { hasRetest: true, entryReady: true, touchedMidpoint: true },
      entry_signal: { signal: direction, risk: { entry: risk.entryPrice, stop: risk.stopLoss, target: risk.takeProfit, rr_ratio: 3.0 }},
      next_action: 'Executar ordem na Binance',
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,asset,date' });

    return {
      signal: direction,
      direction: direction,
      confidence: 85,
      notes: `ADK 3-Step: ${fvg15m.direction} confirmado`,
      phase: 'ADK_STEP_3_ENTRY_READY',
      risk: { entry: risk.entryPrice, stop: risk.stopLoss, target: risk.takeProfit, rr_ratio: 3.0 }
    };
  }

  await supabase.from('adk_strategy_state').upsert({
    user_id: userId,
    asset: asset,
    date: new Date().toISOString().split('T')[0],
    current_phase: 'ADK_STEP_3_RETEST',
    foundation_data: foundation15m,
    fvg15m_data: fvg15m,
    retest_data: retestResult,
    next_action: 'Aguardando retest 50%',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,asset,date' });

  return {
    signal: 'STAY_OUT',
    direction: null,
    confidence: 40,
    notes: '⏳ Aguardando retest 50%',
    phase: 'ADK_STEP_3_RETEST'
  };
}
