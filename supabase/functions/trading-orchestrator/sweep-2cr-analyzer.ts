/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SWEEP + 2CR ANALYZER
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Integração completa: Foundation → Sweep Detection → 2CR Strategy
 * 
 * FLUXO:
 * 1. Obter Foundation (HIGH/LOW da primeira vela de 5min da sessão)
 * 2. Detectar Sweep de Liquidez (preço quebra HIGH ou LOW)
 * 3. Aplicar lógica 2CR completa para entrada de precisão
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { getOrCreateFoundation } from './sweep-foundation.ts';
import { detect2CRAfterSweep } from './sweep-2cr-detector.ts';

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SweepDetection {
  detected: boolean;
  direction: 'BUY' | 'SELL' | null;
  sweepCandle: Candle | null;
  sweepPrice: number;
  foundationLevel: number;
}

interface AnalysisParams {
  candles: {
    '1m': Candle[];
    '5m': Candle[];
  };
  userId: string;
  supabase: any;
  asset: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FUNÇÃO PRINCIPAL: ANALISAR SWEEP COM 2CR
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function analyzeSweepWith2CR({
  candles,
  userId,
  supabase,
  asset
}: AnalysisParams) {
  
  console.log(`\n🔍 ═══════════════════════════════════════════════════════════════`);
  console.log(`   SWEEP LIQUIDITY + 2CR STRATEGY`);
  console.log(`   Asset: ${asset}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  // Determinar sessão atual
  const session = getCurrentSession();
  
  console.log(`📍 Sessão atual: ${session}\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // 1. OBTER FOUNDATION (HIGH/LOW da primeira vela de 5min)
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`1️⃣ BUSCANDO FOUNDATION...`);
  
  const foundation = await getOrCreateFoundation(
    session,
    candles['5m'],
    userId,
    supabase
  );
  
  if (!foundation.valid) {
    console.log(`   └─ ❌ Foundation não disponível ainda\n`);
    return {
      signal: 'STAY_OUT',
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: 'Foundation da sessão ainda não estabelecida',
      phase: 'SWEEP_2CR',
      foundation: null,
      fvg: null,
      risk: null,
      session
    };
  }
  
  console.log(`   ├─ Foundation HIGH: ${foundation.high}`);
  console.log(`   ├─ Foundation LOW: ${foundation.low}`);
  console.log(`   ├─ Timestamp: ${new Date(foundation.timestamp).toISOString()}`);
  console.log(`   └─ ✅ Foundation válida\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // 2. DETECTAR SWEEP DE LIQUIDEZ
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`2️⃣ DETECTANDO SWEEP DE LIQUIDEZ...`);
  
  const sweep = detectSweep(
    candles['1m'],
    foundation.high,
    foundation.low,
    foundation.timestamp
  );
  
  if (!sweep.detected || !sweep.sweepCandle) {
    console.log(`   └─ ⏳ Nenhum sweep detectado\n`);
    return {
      signal: 'STAY_OUT',
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      notes: 'Nenhum sweep de liquidez detectado',
      phase: 'SWEEP_2CR',
      foundation: {
        high: foundation.high,
        low: foundation.low,
        timestamp: foundation.timestamp
      },
      fvg: null,
      risk: null,
      session
    };
  }
  
  console.log(`   ├─ ✅ SWEEP DETECTADO!`);
  console.log(`   ├─ Direção: ${sweep.direction}`);
  console.log(`   ├─ Preço: ${sweep.sweepPrice}`);
  console.log(`   ├─ Foundation Level: ${sweep.foundationLevel}`);
  console.log(`   └─ Timestamp: ${new Date(sweep.sweepCandle.timestamp).toISOString()}\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // 3. APLICAR LÓGICA 2CR COMPLETA
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`3️⃣ APLICANDO ESTRATÉGIA 2CR...`);
  
  const result = await detect2CRAfterSweep(
    candles['1m'],
    sweep.sweepCandle,
    sweep.direction!,
    foundation.high,
    foundation.low,
    asset
  );
  
  // Retornar resultado no formato esperado pelo orchestrator (interface AnalysisResult)
  return {
    signal: result.signal,
    entryPrice: result.entryPrice,
    stopLoss: result.stopLoss,
    takeProfit: result.takeProfit,
    riskReward: result.riskReward,
    confidence: result.confidence,
    notes: result.reason,
    phase: 'SWEEP_2CR',
    foundation: {
      high: foundation.high,
      low: foundation.low,
      timestamp: foundation.timestamp
    },
    fvg: null,
    risk: result.signal === 'BUY' || result.signal === 'SELL' ? {
      entry: result.entryPrice,
      stop: result.stopLoss,
      target: result.takeProfit,
      reward: result.riskReward
    } : null,
    session,
    // Dados específicos da estratégia 2CR (para logging/debugging)
    marketData: {
      sweepDetected: true,
      sweepDirection: sweep.direction,
      foundationHigh: foundation.high,
      foundationLow: foundation.low,
      twocrData: result.twocrData
    }
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HELPER: DETECTAR SWEEP DE LIQUIDEZ
 * ═══════════════════════════════════════════════════════════════════════════
 */
function detectSweep(
  candles1m: Candle[],
  foundationHigh: number,
  foundationLow: number,
  foundationTimestamp: string
): SweepDetection {
  
  // Converter timestamp para número se necessário
  const foundationTime = new Date(foundationTimestamp).getTime();
  
  // Filtrar apenas velas APÓS a foundation
  const candlesAfterFoundation = candles1m.filter(c => c.timestamp > foundationTime);
  
  if (candlesAfterFoundation.length === 0) {
    return {
      detected: false,
      direction: null,
      sweepCandle: null,
      sweepPrice: 0,
      foundationLevel: 0
    };
  }
  
  // Procurar a ÚLTIMA vela que quebrou HIGH ou LOW (mais recente)
  let sweepHigh: Candle | null = null;
  let sweepLow: Candle | null = null;
  
  for (let i = candlesAfterFoundation.length - 1; i >= 0; i--) {
    const candle = candlesAfterFoundation[i];
    
    // Sweep HIGH (vela fecha ACIMA do foundation high)
    if (!sweepHigh && candle.close > foundationHigh) {
      sweepHigh = candle;
    }
    
    // Sweep LOW (vela fecha ABAIXO do foundation low)
    if (!sweepLow && candle.close < foundationLow) {
      sweepLow = candle;
    }
    
    // Se encontramos ambos, parar busca
    if (sweepHigh && sweepLow) break;
  }
  
  // Priorizar o sweep MAIS RECENTE
  if (sweepHigh && sweepLow) {
    if (sweepHigh.timestamp > sweepLow.timestamp) {
      return {
        detected: true,
        direction: 'BUY', // Sweep HIGH
        sweepCandle: sweepHigh,
        sweepPrice: sweepHigh.high,
        foundationLevel: foundationHigh
      };
    } else {
      return {
        detected: true,
        direction: 'SELL', // Sweep LOW
        sweepCandle: sweepLow,
        sweepPrice: sweepLow.low,
        foundationLevel: foundationLow
      };
    }
  }
  
  if (sweepHigh) {
    return {
      detected: true,
      direction: 'BUY', // Sweep HIGH
      sweepCandle: sweepHigh,
      sweepPrice: sweepHigh.high,
      foundationLevel: foundationHigh
    };
  }
  
  if (sweepLow) {
    return {
      detected: true,
      direction: 'SELL', // Sweep LOW
      sweepCandle: sweepLow,
      sweepPrice: sweepLow.low,
      foundationLevel: foundationLow
    };
  }
  
  return {
    detected: false,
    direction: null,
    sweepCandle: null,
    sweepPrice: 0,
    foundationLevel: 0
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HELPER: DETERMINAR SESSÃO ATUAL (UTC)
 * ═══════════════════════════════════════════════════════════════════════════
 */
function getCurrentSession(): string {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const totalMinutes = hour * 60 + minute;
  
  // Horários de início em minutos UTC
  const sessions = [
    { name: 'WELLINGTON', start: 21 * 60 }, // 21:00
    { name: 'SYDNEY', start: 23 * 60 },     // 23:00
    { name: 'SINGAPORE', start: 1 * 60 },   // 01:00
    { name: 'HONG_KONG', start: 1 * 60 + 30 }, // 01:30
    { name: 'TOKYO', start: 2 * 60 },       // 02:00
    { name: 'LONDON', start: 8 * 60 },      // 08:00
    { name: 'NY', start: 13 * 60 }          // 13:00
  ];
  
  // Encontrar a sessão ativa (última sessão que já começou)
  let activeSession = 'NY'; // Default
  
  for (let i = sessions.length - 1; i >= 0; i--) {
    const session = sessions[i];
    
    // Se estamos após o início da sessão
    if (totalMinutes >= session.start) {
      activeSession = session.name;
      break;
    }
  }
  
  // Se estamos antes de WELLINGTON (21:00), ainda é NY do dia anterior
  if (totalMinutes < 21 * 60) {
    activeSession = 'NY';
  }
  
  return activeSession;
}
