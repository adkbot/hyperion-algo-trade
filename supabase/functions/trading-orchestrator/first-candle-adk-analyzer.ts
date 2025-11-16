// ============================================
// ADK STRATEGY ANALYZER - MAIN ORCHESTRATOR
// ============================================
// Orquestra os 5 passos da estratégia ADK

import { getOrCreateFoundation15m } from './first-candle-foundation-15m.ts';
import { detectFVG15m, type FVG15mResult } from './first-candle-fvg-15m.ts';
import { detectFVGRetest } from './first-candle-fvg-retest.ts';
import { detect1mConfirmation } from './first-candle-confirmation-1m.ts';

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
  confirmation1m?: any;
}

/**
 * Analisa a estratégia ADK completa em 5 passos
 */
export async function analyzeADKStrategy(params: AnalysisParams): Promise<ADKAnalysisResult> {
  const { candles, asset, userId, supabase } = params;
  
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ADK STRATEGY ANALYSIS');
  console.log('   Asset:', asset);
  console.log('   Multi-Timeframe: 15m + 1m');
  console.log('='.repeat(70));
  
  // ========================================
  // PASSO 1: FOUNDATION 15M
  // ========================================
  console.log('\n1️⃣ PASSO 1: FOUNDATION 15M (Primeira vela do dia)');
  
  const foundation15m = await getOrCreateFoundation15m(candles['15m'], userId, supabase);
  
  if (!foundation15m.isValid) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      notes: '⏳ Aguardando foundation 15m (primeira vela do dia)',
      phase: 'ADK_STEP_1_FOUNDATION',
      foundation: foundation15m
    };
  }
  
  console.log(`✅ Foundation 15m válida: $${foundation15m.high} / $${foundation15m.low}`);
  
  // ========================================
  // PASSO 2: SWEEP + FVG 15M
  // ========================================
  console.log('\n2️⃣ PASSO 2: SWEEP + FVG 15M');
  
  const fvg15m = detectFVG15m(
    candles['15m'],
    foundation15m.high,
    foundation15m.low
  );
  
  if (!fvg15m.fvgDetected || !fvg15m.sweepConfirmed) {
    return {
      signal: 'STAY_OUT',
      direction: null,
      confidence: 0,
      notes: '⏳ Aguardando Sweep + FVG em 15m',
      phase: 'ADK_STEP_2_FVG_15M',
      foundation: foundation15m,
      fvg15m
    };
  }
  
  console.log(`✅ FVG 15m detectado: ${fvg15m.direction}`);
  console.log(`   Zone: $${fvg15m.fvgBottom} - $${fvg15m.fvgTop}`);
  console.log(`   Midpoint (50%): $${fvg15m.fvgMidpoint}`);
  
  // ========================================
  // PASSO 3: RETEST 50% FVG
  // ========================================
  console.log('\n3️⃣ PASSO 3: RETEST 50% DO FVG 15M (Consequent Encroachment)');
  
  const retest = detectFVGRetest(candles['15m'], {
    fvgTop: fvg15m.fvgTop,
    fvgBottom: fvg15m.fvgBottom,
    fvgMidpoint: fvg15m.fvgMidpoint,
    direction: fvg15m.direction,
    timestamp: fvg15m.timestamp
  });
  
  if (!retest.hasRetest || !retest.entryReady) {
    return {
      signal: 'STAY_OUT',
      direction: fvg15m.direction,
      confidence: 0.4,
      notes: '⏳ Aguardando retest 50% do FVG 15m',
      phase: 'ADK_STEP_3_RETEST_50',
      foundation: foundation15m,
      fvg15m,
      retest
    };
  }
  
  console.log(`✅ Retest 50% confirmado em $${retest.retestPrice}`);
  
  // ========================================
  // PASSO 4: CONFIRMAÇÃO 1M (SWEEP + FVG)
  // ========================================
  console.log('\n4️⃣ PASSO 4: CONFIRMAÇÃO 1M (Sweep + FVG 1m)');
  
  const confirmation1m = detect1mConfirmation(
    candles['1m'],
    fvg15m.direction,
    fvg15m.fvgMidpoint,
    fvg15m.fvgTop,
    fvg15m.fvgBottom
  );
  
  if (!confirmation1m.confirmed) {
    return {
      signal: 'STAY_OUT',
      direction: fvg15m.direction,
      confidence: 0.6,
      notes: '⏳ Aguardando confirmação 1m (Sweep + FVG)',
      phase: 'ADK_STEP_4_CONFIRMATION_1M',
      foundation: foundation15m,
      fvg15m,
      retest,
      confirmation1m
    };
  }
  
  console.log(`✅ Confirmação 1m completa!`);
  console.log(`   Sweep 1m: ✅`);
  console.log(`   FVG 1m: ✅`);
  
  // ========================================
  // PASSO 5: SINAL DE ENTRADA! 🎯
  // ========================================
  console.log('\n5️⃣ PASSO 5: ✅ SINAL DE ENTRADA CONFIRMADO!');
  console.log('='.repeat(70));
  console.log(`🎯 DIREÇÃO: ${fvg15m.direction}`);
  console.log(`💰 ENTRY: $${confirmation1m.entryPrice}`);
  console.log(`🛡️ STOP: $${confirmation1m.stopLoss}`);
  console.log(`🎯 TARGET: $${confirmation1m.takeProfit}`);
  console.log(`📊 R:R: ${confirmation1m.riskReward.toFixed(2)}:1`);
  console.log(`⭐ CONFIANÇA: 85%`);
  console.log('='.repeat(70) + '\n');
  
  return {
    signal: fvg15m.direction as 'BUY' | 'SELL',
    direction: fvg15m.direction,
    confidence: 0.85, // Alta confiança (5 validações)
    notes: `✅ ADK Strategy: Sweep 15m → FVG 15m → Retest 50% → Sweep 1m → FVG 1m`,
    phase: 'ADK_COMPLETE',
    risk: {
      entry: confirmation1m.entryPrice,
      stop: confirmation1m.stopLoss,
      target: confirmation1m.takeProfit,
      rr_ratio: confirmation1m.riskReward
    },
    foundation: foundation15m,
    fvg15m,
    retest,
    confirmation1m
  };
}
