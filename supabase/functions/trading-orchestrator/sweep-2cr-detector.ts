/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SWEEP + 2CR (TWO CANDLE REVERSAL) DETECTOR
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Implementação da estratégia "The 2 CR Blueprint" conforme PDF
 * 
 * 5 PASSOS DA ESTRATÉGIA:
 * 
 * 1. DEFINIR INTENÇÃO DO MERCADO
 *    - Bearish: Quando Discount Array (FVG Bullish) é DESRESPEITADO
 *    - Bullish: Quando Premium Array (FVG Bearish) é DESRESPEITADO
 * 
 * 2. CONFIRMAR A INTENÇÃO
 *    - Para Bearish: Preço sobe para Premium Array e RESPEITA com Bearish 2CR
 *    - Para Bullish: Preço desce para Discount Array e RESPEITA com Bullish 2CR
 * 
 * 3. RESOLVER CENÁRIO 50/50
 *    - Se ambos (Premium e Discount) forem RESPEITADOS → Cenário 50/50
 *    - Solução: Aguardar DESRESPEITO do 2CR oposto
 * 
 * 4. GATILHO DE PRECISÃO
 *    - Bearish Entry: Bullish 2CR (suporte) DESRESPEITADO
 *    - Bullish Entry: Bearish 2CR (resistência) DESRESPEITADO
 * 
 * 5. ENTRADA COM MÁXIMA PRECISÃO
 *    - Entrada na primeira vela que desrespeita o 2CR oposto
 *    - Stop Loss: No extremo do 2CR desrespeitado
 *    - Take Profit: Risk/Reward 1:2
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TwoCRPattern {
  detected: boolean;
  candle1: Candle;
  candle2: Candle;
  lastCandle: Candle;
  supportLevel?: number;  // Para Bullish 2CR
  resistanceLevel?: number; // Para Bearish 2CR
}

interface TwoCRData {
  firstArray: 'PREMIUM' | 'DISCOUNT';
  firstArrayDisrespected: boolean;
  confirmationArray: 'PREMIUM' | 'DISCOUNT' | null;
  confirmationArrayRespected: boolean;
  confirmation2CR: TwoCRPattern | null;
  opposite2CR: TwoCRPattern | null;
  opposite2CRDisrespected: boolean;
  entryCandle: Candle | null;
  scenario: 'DIRECT_ENTRY' | 'FIFTY_FIFTY' | 'WAITING_CONFIRMATION' | 'WAITING_DISRESPECT';
}

interface DetectionResult {
  signal: 'BUY' | 'SELL' | 'WAIT' | 'STAY_OUT';
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  reason: string;
  twocrData: TwoCRData;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FUNÇÃO PRINCIPAL: DETECTAR 2CR APÓS SWEEP
 * ═══════════════════════════════════════════════════════════════════════════
 */
export async function detect2CRAfterSweep(
  candles1m: Candle[],
  sweepCandle: Candle,
  sweepDirection: 'BUY' | 'SELL', // BUY = Sweep HIGH, SELL = Sweep LOW
  foundationHigh: number,
  foundationLow: number,
  asset: string,
  relaxedMode: boolean = false // NOVO: Modo relaxado para direct entry
): Promise<DetectionResult> {
  
  console.log(`\n🔍 ═══════════════════════════════════════════════════════════════`);
  console.log(`   SWEEP + 2CR ANALYSIS - ${asset}`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 1: DEFINIR INTENÇÃO DO MERCADO
  // ═══════════════════════════════════════════════════════════════════════
  
  let intention: 'BEARISH' | 'BULLISH';
  let firstArray: 'PREMIUM' | 'DISCOUNT';
  
  if (sweepDirection === 'BUY') {
    // Sweep HIGH = PREMIUM ARRAY DISRESPECTED → Bearish Intention
    firstArray = 'PREMIUM';
    intention = 'BEARISH';
    console.log(`1️⃣ SWEEP DETECTADO:`);
    console.log(`   ├─ Direção: BUY (HIGH sweepado)`);
    console.log(`   ├─ Sweep Candle: ${sweepCandle.high} @ ${new Date(sweepCandle.timestamp).toISOString()}`);
    console.log(`   ├─ Foundation HIGH: ${foundationHigh}`);
    console.log(`   └─ Intenção: BEARISH (Premium Array Disrespected)\n`);
  } else {
    // Sweep LOW = DISCOUNT ARRAY DISRESPECTED → Bullish Intention
    firstArray = 'DISCOUNT';
    intention = 'BULLISH';
    console.log(`1️⃣ SWEEP DETECTADO:`);
    console.log(`   ├─ Direção: SELL (LOW sweepado)`);
    console.log(`   ├─ Sweep Candle: ${sweepCandle.low} @ ${new Date(sweepCandle.timestamp).toISOString()}`);
    console.log(`   ├─ Foundation LOW: ${foundationLow}`);
    console.log(`   └─ Intenção: BULLISH (Discount Array Disrespected)\n`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // MODO RELAXADO: DIRECT ENTRY COM 1 VELA DE CONFIRMAÇÃO
  // ═══════════════════════════════════════════════════════════════════════
  
  if (relaxedMode) {
    console.log(`\n⚡ MODO RELAXADO: Buscando confirmação simples após sweep...`);
    
    // Pegar próximas 5 velas após sweep para análise
    const candlesAfterSweep = candles1m.filter(c => c.timestamp > sweepCandle.timestamp).slice(0, 5);
    
    if (candlesAfterSweep.length >= 1) {
      const confirmationCandle = candlesAfterSweep[0];
      
      // Calcular volume médio
      const recentVolumes = candles1m.slice(-20).map(c => c.volume);
      const avgVolume = recentVolumes.reduce((a, b) => a + b, 0) / recentVolumes.length;
      const bodySize = Math.abs(confirmationCandle.close - confirmationCandle.open);
      const candleRange = confirmationCandle.high - confirmationCandle.low;
      const bodyRatio = bodySize / candleRange;
      
      // Critérios simples:
      // 1. Volume 1.5x maior que média
      // 2. Corpo > 60% da vela (vela expressiva)
      // 3. Reversão na direção esperada
      const isExpressive = confirmationCandle.volume > avgVolume * 1.5 && bodyRatio > 0.6;
      const confirmsIntention = intention === 'BULLISH' 
        ? confirmationCandle.close > confirmationCandle.open // Vela verde
        : confirmationCandle.close < confirmationCandle.open; // Vela vermelha
      
      console.log(`   ├─ Vela confirmação: ${confirmsIntention ? '✅' : '❌'}`);
      console.log(`   ├─ Volume: ${(confirmationCandle.volume / avgVolume).toFixed(2)}x (${isExpressive ? '✅' : '❌'})`);
      console.log(`   └─ Corpo: ${(bodyRatio * 100).toFixed(1)}% (${bodyRatio > 0.6 ? '✅' : '❌'})`);
      
      if (isExpressive && confirmsIntention) {
        console.log(`\n✅ CONFIRMAÇÃO RELAXADA ENCONTRADA!`);
        
        // Calcular entrada direta
        const entryPrice = intention === 'BULLISH' 
          ? confirmationCandle.close 
          : confirmationCandle.close;
        
        const stopLoss = intention === 'BULLISH'
          ? confirmationCandle.low - (confirmationCandle.low * 0.001) // 0.1% abaixo do low
          : confirmationCandle.high + (confirmationCandle.high * 0.001); // 0.1% acima do high
        
        const risk = Math.abs(entryPrice - stopLoss);
        const takeProfit = intention === 'BULLISH'
          ? entryPrice + (risk * 3.0) // R:R 1:3.0 FIXO
          : entryPrice - (risk * 3.0);
        
        const riskReward = 3.0; // SEMPRE 3.0
        
        console.log(`\n💰 DIRECT ENTRY (MODO RELAXADO):`);
        console.log(`   ├─ Entry: ${entryPrice}`);
        console.log(`   ├─ Stop Loss: ${stopLoss}`);
        console.log(`   ├─ Take Profit: ${takeProfit}`);
        console.log(`   └─ R:R: 1:${riskReward}`);
        
        return {
          signal: intention === 'BULLISH' ? 'BUY' : 'SELL',
          entryPrice,
          stopLoss,
          takeProfit,
          riskReward,
          confidence: 75, // Confiança moderada
          reason: `Direct Entry (Modo Relaxado): Sweep ${sweepDirection} + confirmação de 1 vela expressiva`,
          twocrData: {
            firstArray: intention === 'BULLISH' ? 'DISCOUNT' : 'PREMIUM',
            firstArrayDisrespected: true,
            confirmationArray: null,
            confirmationArrayRespected: false,
            confirmation2CR: null,
            opposite2CR: null,
            opposite2CRDisrespected: false,
            entryCandle: confirmationCandle,
            scenario: 'DIRECT_ENTRY'
          }
        };
      }
    }
    
    console.log(`   └─ ❌ Confirmação relaxada não encontrada, voltando para lógica 2CR normal...`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 2: PROCURAR CONFIRMAÇÃO (2CR na direção da intenção)
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`\n2️⃣ PROCURANDO CONFIRMAÇÃO 2CR (${intention})...`);
  
  const confirmation2CR = find2CRPattern(
    candles1m,
    sweepCandle,
    intention
  );
  
  if (!confirmation2CR) {
    console.log(`   └─ Status: ⏳ Aguardando ${intention} 2CR\n`);
    return {
      signal: 'WAIT',
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      reason: `Aguardando ${intention} 2CR de confirmação`,
      twocrData: {
        firstArray,
        firstArrayDisrespected: true,
        confirmationArray: null,
        confirmationArrayRespected: false,
        confirmation2CR: null,
        opposite2CR: null,
        opposite2CRDisrespected: false,
        entryCandle: null,
        scenario: 'WAITING_CONFIRMATION'
      }
    };
  }
  
  console.log(`   ├─ ${intention} 2CR DETECTADO!`);
  console.log(`   ├─ Candle 1: High ${confirmation2CR.candle1.high} | Low ${confirmation2CR.candle1.low}`);
  console.log(`   ├─ Candle 2: High ${confirmation2CR.candle2.high} | Low ${confirmation2CR.candle2.low}`);
  console.log(`   └─ Status: ✅ ${intention} 2CR RESPEITADO\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 3: VERIFICAR CENÁRIO 50/50 (2CR oposto)
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`3️⃣ VERIFICANDO CENÁRIO 50/50...`);
  
  const opposite2CR = find2CRPattern(
    candles1m,
    confirmation2CR.lastCandle,
    intention === 'BEARISH' ? 'BULLISH' : 'BEARISH'
  );
  
  if (!opposite2CR) {
    // SEM 2CR oposto → ENTRADA DIRETA!
    console.log(`   └─ Status: ✅ SEM 2CR oposto - ENTRADA DIRETA!\n`);
    
    const entry = calculateDirectEntry(confirmation2CR, intention, foundationHigh, foundationLow);
    
    return {
      ...entry,
      twocrData: {
        firstArray,
        firstArrayDisrespected: true,
        confirmationArray: intention === 'BEARISH' ? 'PREMIUM' : 'DISCOUNT',
        confirmationArrayRespected: true,
        confirmation2CR,
        opposite2CR: null,
        opposite2CRDisrespected: false,
        entryCandle: confirmation2CR.lastCandle,
        scenario: 'DIRECT_ENTRY'
      }
    };
  }
  
  console.log(`   ├─ ${intention === 'BEARISH' ? 'BULLISH' : 'BEARISH'} 2CR DETECTADO!`);
  console.log(`   ├─ Candle 1: High ${opposite2CR.candle1.high} | Low ${opposite2CR.candle1.low}`);
  console.log(`   ├─ Candle 2: High ${opposite2CR.candle2.high} | Low ${opposite2CR.candle2.low}`);
  console.log(`   └─ Status: ⚠️ CENÁRIO 50/50 (Ambos 2CR respeitados)\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 4: AGUARDAR DESRESPEITO DO 2CR OPOSTO (Gatilho de Precisão)
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`4️⃣ PROCURANDO DESRESPEITO DO 2CR OPOSTO...`);
  
  const disrespectCandle = findDisrespectOf2CR(
    candles1m,
    opposite2CR,
    intention
  );
  
  if (!disrespectCandle) {
    console.log(`   └─ Status: ⏳ Aguardando desrespeito do ${intention === 'BEARISH' ? 'Bullish' : 'Bearish'} 2CR\n`);
    return {
      signal: 'WAIT',
      entryPrice: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskReward: 0,
      confidence: 0,
      reason: `Cenário 50/50 - Aguardando desrespeito do ${intention === 'BEARISH' ? 'Bullish' : 'Bearish'} 2CR`,
      twocrData: {
        firstArray,
        firstArrayDisrespected: true,
        confirmationArray: intention === 'BEARISH' ? 'PREMIUM' : 'DISCOUNT',
        confirmationArrayRespected: true,
        confirmation2CR,
        opposite2CR,
        opposite2CRDisrespected: false,
        entryCandle: null,
        scenario: 'WAITING_DISRESPECT'
      }
    };
  }
  
  console.log(`   ├─ ${intention === 'BEARISH' ? 'Bullish' : 'Bearish'} 2CR DESRESPEITADO!`);
  console.log(`   ├─ Vela: ${disrespectCandle.close} @ ${new Date(disrespectCandle.timestamp).toISOString()}`);
  console.log(`   └─ Status: ✅ GATILHO DE PRECISÃO ATIVADO!\n`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 5: ENTRADA DE MÁXIMA PRECISÃO!
  // ═══════════════════════════════════════════════════════════════════════
  
  console.log(`5️⃣ CALCULANDO ENTRADA DE PRECISÃO...`);
  
  const precisionEntry = calculatePrecisionEntry(disrespectCandle, opposite2CR, intention);
  
  console.log(`   ├─ Signal: ${precisionEntry.signal}`);
  console.log(`   ├─ Entry: ${precisionEntry.entryPrice}`);
  console.log(`   ├─ Stop Loss: ${precisionEntry.stopLoss}`);
  console.log(`   ├─ Take Profit: ${precisionEntry.takeProfit}`);
  console.log(`   ├─ Risk/Reward: 1:${precisionEntry.riskReward}`);
  console.log(`   └─ Confidence: ${precisionEntry.confidence}%\n`);
  
  console.log(`═══════════════════════════════════════════════════════════════\n`);
  
  return {
    ...precisionEntry,
    twocrData: {
      firstArray,
      firstArrayDisrespected: true,
      confirmationArray: intention === 'BEARISH' ? 'PREMIUM' : 'DISCOUNT',
      confirmationArrayRespected: true,
      confirmation2CR,
      opposite2CR,
      opposite2CRDisrespected: true,
      entryCandle: disrespectCandle,
      scenario: 'FIFTY_FIFTY'
    }
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HELPER: ENCONTRAR PADRÃO 2CR (TWO CANDLE REVERSAL)
 * ═══════════════════════════════════════════════════════════════════════════
 */
function find2CRPattern(
  candles: Candle[],
  startAfterCandle: Candle,
  intention: 'BULLISH' | 'BEARISH'
): TwoCRPattern | null {
  
  // ═══════════════════════════════════════════════════════════════════════════
  // 🔍 FASE 3: LOGS DETALHADOS PARA DIAGNÓSTICO
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`\n🔍 BUSCANDO PADRÃO 2CR:`);
  console.log(`├─ Intenção: ${intention}`);
  console.log(`├─ Velas disponíveis: ${candles.length}`);
  console.log(`└─ Após timestamp: ${startAfterCandle.timestamp}`);
  
  const startIndex = candles.findIndex(c => c.timestamp === startAfterCandle.timestamp);
  
  if (startIndex === -1) {
    console.log(`❌ Vela de referência não encontrada no array`);
    return null;
  }
  
  if (startIndex >= candles.length - 2) {
    console.log(`❌ Não há velas suficientes após a referência (index: ${startIndex}/${candles.length})`);
    return null;
  }
  
  console.log(`✅ Vela de referência encontrada no index ${startIndex}`);
  console.log(`📊 Analisando próximas ${Math.min(20, candles.length - startIndex - 1)} velas...\n`);
  
  // Buscar nas próximas 20 velas após o sweep
  const maxLookAhead = Math.min(startIndex + 20, candles.length - 1);
  
  for (let i = startIndex + 1; i < maxLookAhead; i++) {
    const candle1 = candles[i];
    const candle2 = candles[i + 1];
    
    if (!candle2) break;
    
    if (intention === 'BEARISH') {
      // Bearish 2CR:
      // - Candle 1: Rejeita para baixo (preferencialmente bearish)
      // - Candle 2: Confirma (close abaixo do low do candle 1 OU high menor que high do candle 1)
      
      const candle1HasRejection = candle1.close < candle1.open || (candle1.high - candle1.close) > (candle1.close - candle1.low);
      const candle2Confirms = candle2.close < candle1.low || candle2.high < candle1.high;
      
      if (candle1HasRejection && candle2Confirms) {
        console.log(`\n✅ PADRÃO 2CR ${intention} ENCONTRADO!`);
        console.log(`├─ Candle 1 index: ${i}`);
        console.log(`├─ Candle 2 index: ${i + 1}`);
        console.log(`└─ Resistance Level: ${candle1.high}\n`);
        
        return {
          detected: true,
          candle1,
          candle2,
          lastCandle: candle2,
          resistanceLevel: Math.max(candle1.high, candle2.high)
        };
      }
    } else {
      // Bullish 2CR:
      // - Candle 1: Rejeita para cima (preferencialmente bullish)
      // - Candle 2: Confirma (close acima do high do candle 1 OU low maior que low do candle 1)
      
      const candle1HasRejection = candle1.close > candle1.open || (candle1.close - candle1.low) > (candle1.high - candle1.close);
      const candle2Confirms = candle2.close > candle1.high || candle2.low > candle1.low;
      
      if (candle1HasRejection && candle2Confirms) {
        console.log(`\n✅ PADRÃO 2CR ${intention} ENCONTRADO!`);
        console.log(`├─ Candle 1 index: ${i}`);
        console.log(`├─ Candle 2 index: ${i + 1}`);
        console.log(`└─ Support Level: ${Math.min(candle1.low, candle2.low)}\n`);
        
        return {
          detected: true,
          candle1,
          candle2,
          lastCandle: candle2,
          supportLevel: Math.min(candle1.low, candle2.low)
        };
      }
    }
  }
  
  console.log(`❌ Nenhum padrão 2CR ${intention} encontrado nas ${maxLookAhead - startIndex - 1} velas analisadas\n`);
  
  return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HELPER: ENCONTRAR DESRESPEITO DO 2CR
 * ═══════════════════════════════════════════════════════════════════════════
 */
function findDisrespectOf2CR(
  candles: Candle[],
  twoCR: TwoCRPattern,
  originalIntention: 'BULLISH' | 'BEARISH'
): Candle | null {
  
  const startIndex = candles.findIndex(c => c.timestamp === twoCR.candle2.timestamp);
  if (startIndex === -1) return null;
  
  // Procurar nas próximas 15 velas
  const maxLookAhead = Math.min(startIndex + 15, candles.length);
  
  if (originalIntention === 'BEARISH') {
    // Se intenção original era BEARISH e há um Bullish 2CR oposto,
    // aguardar vela que QUEBRA ABAIXO do support do Bullish 2CR
    const supportLevel = twoCR.supportLevel || Math.min(twoCR.candle1.low, twoCR.candle2.low);
    
    for (let i = startIndex + 1; i < maxLookAhead; i++) {
      if (candles[i].close < supportLevel) {
        return candles[i]; // Desrespeito confirmado!
      }
    }
  } else {
    // Se intenção original era BULLISH e há um Bearish 2CR oposto,
    // aguardar vela que QUEBRA ACIMA do resistance do Bearish 2CR
    const resistanceLevel = twoCR.resistanceLevel || Math.max(twoCR.candle1.high, twoCR.candle2.high);
    
    for (let i = startIndex + 1; i < maxLookAhead; i++) {
      if (candles[i].close > resistanceLevel) {
        return candles[i]; // Desrespeito confirmado!
      }
    }
  }
  
  return null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HELPER: CALCULAR ENTRADA DIRETA (Sem 2CR oposto)
 * ═══════════════════════════════════════════════════════════════════════════
 */
function calculateDirectEntry(
  confirmation2CR: TwoCRPattern,
  intention: 'BULLISH' | 'BEARISH',
  foundationHigh: number,
  foundationLow: number
): Omit<DetectionResult, 'twocrData'> {
  
  if (intention === 'BEARISH') {
    // Entrada SELL
    const entry = confirmation2CR.candle2.close;
    const stop = confirmation2CR.resistanceLevel || Math.max(confirmation2CR.candle1.high, confirmation2CR.candle2.high);
    const risk = stop - entry;
    const target = entry - (risk * 3); // R:R 3:1
    
    return {
      signal: 'SELL',
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: Math.max(target, foundationLow), // Não ultrapassar foundation low
      riskReward: 3,
      confidence: 80,
      reason: '2CR Bearish confirmado - Entrada direta (sem 2CR oposto)'
    };
  } else {
    // Entrada BUY
    const entry = confirmation2CR.candle2.close;
    const stop = confirmation2CR.supportLevel || Math.min(confirmation2CR.candle1.low, confirmation2CR.candle2.low);
    const risk = entry - stop;
    const target = entry + (risk * 3); // R:R 3:1
    
    return {
      signal: 'BUY',
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: Math.min(target, foundationHigh), // Não ultrapassar foundation high
      riskReward: 3,
      confidence: 80,
      reason: '2CR Bullish confirmado - Entrada direta (sem 2CR oposto)'
    };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HELPER: CALCULAR ENTRADA DE PRECISÃO (Após desrespeito do 2CR oposto)
 * ═══════════════════════════════════════════════════════════════════════════
 */
function calculatePrecisionEntry(
  disrespectCandle: Candle,
  opposite2CR: TwoCRPattern,
  intention: 'BULLISH' | 'BEARISH'
): Omit<DetectionResult, 'twocrData'> {
  
  if (intention === 'BEARISH') {
    // Entrada SELL após Bullish 2CR ser desrespeitado
    const entry = disrespectCandle.close;
    const stop = opposite2CR.supportLevel || Math.min(opposite2CR.candle1.low, opposite2CR.candle2.low);
    const stopWithBuffer = stop + (Math.abs(stop) * 0.001); // 0.1% buffer
    const risk = stopWithBuffer - entry;
    const target = entry - (risk * 3); // R:R 3:1
    
    return {
      signal: 'SELL',
      entryPrice: entry,
      stopLoss: stopWithBuffer,
      takeProfit: target,
      riskReward: 3,
      confidence: 90, // Alta confiança (50/50 resolvido)
      reason: '2CR Bullish desrespeitado - Entrada de máxima precisão (cenário 50/50 resolvido)'
    };
  } else {
    // Entrada BUY após Bearish 2CR ser desrespeitado
    const entry = disrespectCandle.close;
    const stop = opposite2CR.resistanceLevel || Math.max(opposite2CR.candle1.high, opposite2CR.candle2.high);
    const stopWithBuffer = stop - (Math.abs(stop) * 0.001); // 0.1% buffer
    const risk = entry - stopWithBuffer;
    const target = entry + (risk * 3); // R:R 3:1
    
    return {
      signal: 'BUY',
      entryPrice: entry,
      stopLoss: stopWithBuffer,
      takeProfit: target,
      riskReward: 3,
      confidence: 90, // Alta confiança (50/50 resolvido)
      reason: '2CR Bearish desrespeitado - Entrada de máxima precisão (cenário 50/50 resolvido)'
    };
  }
}
