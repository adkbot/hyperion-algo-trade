/**
 * ANALISADOR DE MOMENTUM - ESTRATÉGIA SCALPING 1 MINUTO
 * 
 * Responsável por:
 * 1. Calcular Risk/Reward atual das posições
 * 2. Analisar continuidade vs fraqueza no momentum
 * 3. Decidir fechamento antecipado na zona 1.0-1.5 RR
 * 
 * REGRAS CRÍTICAS:
 * - Zona de proteção: 1.0 - 1.5 RR
 * - Se fraqueza detectada: FECHAR IMEDIATAMENTE
 * - Se continuidade confirmada: MANTER ATÉ 3:1
 * - Se indefinido: FECHAR (segurança)
 */

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface ActivePosition {
  id: string;
  asset: string;
  direction: 'BUY' | 'SELL';
  entry_price: number;
  current_price: number;
  stop_loss: number;
  take_profit: number;
  current_pnl: number;
  user_id: string;
}

interface ContinuityAnalysis {
  hasContinuity: boolean;
  signals: string[];
  score: number;
}

interface WeaknessAnalysis {
  hasWeakness: boolean;
  signals: string[];
  score: number;
}

interface ClosureDecision {
  shouldClose: boolean;
  reason: string;
  confidence: number;
}

/**
 * Calcula o Risk/Reward atual da posição
 */
export function calculateCurrentRR(position: ActivePosition): number {
  const { entry_price, current_price, stop_loss, direction } = position;
  
  if (direction === 'BUY') {
    const risk = entry_price - stop_loss;
    const reward = current_price - entry_price;
    return risk > 0 ? reward / risk : 0;
  } else {
    const risk = stop_loss - entry_price;
    const reward = entry_price - current_price;
    return risk > 0 ? reward / risk : 0;
  }
}

/**
 * Busca candles recentes da Binance (1min)
 */
export async function fetchRecentCandles(
  asset: string, 
  limit: number = 5
): Promise<Candle[]> {
  try {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${asset}&interval=1m&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`❌ Erro ao buscar candles: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    return data.map((k: any) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  } catch (error) {
    console.error(`❌ Erro ao buscar candles:`, error);
    return [];
  }
}

/**
 * Analisa CONTINUIDADE do momentum (sinais positivos)
 */
export function analyzeContinuity(
  candles: Candle[], 
  direction: 'BUY' | 'SELL'
): ContinuityAnalysis {
  if (candles.length < 3) {
    return { hasContinuity: false, signals: ['Candles insuficientes'], score: 0 };
  }
  
  const signals: string[] = [];
  let score = 0;
  const recentCandles = candles.slice(-3); // Últimas 3 velas
  
  // ✅ CRITÉRIO 1: Velas fortes na direção (corpo > 60% da vela)
  const strongCandles = recentCandles.filter(c => {
    const body = Math.abs(c.close - c.open);
    const total = c.high - c.low;
    const bodyPercent = total > 0 ? (body / total) * 100 : 0;
    
    const isInDirection = direction === 'BUY' ? c.close > c.open : c.close < c.open;
    return isInDirection && bodyPercent > 60;
  });
  
  if (strongCandles.length >= 2) {
    signals.push(`${strongCandles.length} velas fortes na direção`);
    score += 2;
  }
  
  // ✅ CRITÉRIO 2: Sem rejeições significativas (pavios contra < 30% do corpo)
  const noRejections = recentCandles.filter(c => {
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    
    const wickAgainst = direction === 'BUY' ? upperWick : lowerWick;
    const rejectionPercent = body > 0 ? (wickAgainst / body) * 100 : 100;
    
    return rejectionPercent < 30;
  });
  
  if (noRejections.length >= 2) {
    signals.push('Sem rejeições significativas');
    score += 2;
  }
  
  // ✅ CRITÉRIO 3: Pavios curtos contra tendência (< 20% do tamanho total)
  const shortWicks = recentCandles.filter(c => {
    const total = c.high - c.low;
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;
    
    const wickAgainst = direction === 'BUY' ? upperWick : lowerWick;
    const wickPercent = total > 0 ? (wickAgainst / total) * 100 : 0;
    
    return wickPercent < 20;
  });
  
  if (shortWicks.length >= 2) {
    signals.push('Pavios curtos contra tendência');
    score += 1;
  }
  
  // ✅ CRITÉRIO 4: Sequência saudável (2+ velas na mesma direção)
  const sameDirection = recentCandles.filter(c => 
    direction === 'BUY' ? c.close > c.open : c.close < c.open
  );
  
  if (sameDirection.length >= 2) {
    signals.push(`${sameDirection.length} velas na direção do trade`);
    score += 2;
  }
  
  // ✅ CRITÉRIO 5: Volume crescente ou estável
  if (recentCandles.length >= 2) {
    const avgVolume = recentCandles.reduce((sum, c) => sum + c.volume, 0) / recentCandles.length;
    const lastVolume = recentCandles[recentCandles.length - 1].volume;
    
    if (lastVolume >= avgVolume * 0.9) {
      signals.push('Volume estável/crescente');
      score += 1;
    }
  }
  
  // ✅ CRITÉRIO 6: Deslocamento coerente (preço avançando)
  const firstPrice = recentCandles[0].close;
  const lastPrice = recentCandles[recentCandles.length - 1].close;
  const priceMove = direction === 'BUY' ? lastPrice > firstPrice : lastPrice < firstPrice;
  
  if (priceMove) {
    const movePercent = Math.abs((lastPrice - firstPrice) / firstPrice) * 100;
    signals.push(`Deslocamento positivo: ${movePercent.toFixed(2)}%`);
    score += 2;
  }
  
  // DECISÃO: >= 6 pontos = continuidade confirmada
  const hasContinuity = score >= 6;
  
  return { hasContinuity, signals, score };
}

/**
 * Analisa FRAQUEZA do momentum (sinais negativos)
 */
export function analyzeWeakness(
  candles: Candle[], 
  direction: 'BUY' | 'SELL'
): WeaknessAnalysis {
  if (candles.length < 3) {
    return { hasWeakness: false, signals: ['Candles insuficientes'], score: 0 };
  }
  
  const signals: string[] = [];
  let score = 0;
  const recentCandles = candles.slice(-3);
  const lastCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2];
  
  // ❌ CRITÉRIO 1: Vela contrária logo após tocar 1RR (corpo contra > 50%)
  const lastBody = Math.abs(lastCandle.close - lastCandle.open);
  const lastTotal = lastCandle.high - lastCandle.low;
  const lastBodyPercent = lastTotal > 0 ? (lastBody / lastTotal) * 100 : 0;
  const isCounterCandle = direction === 'BUY' ? lastCandle.close < lastCandle.open : lastCandle.close > lastCandle.open;
  
  if (isCounterCandle && lastBodyPercent > 50) {
    signals.push(`Vela contrária forte (${lastBodyPercent.toFixed(1)}%)`);
    score += 3;
  }
  
  // ❌ CRITÉRIO 2: Inside bar após impulso
  if (lastCandle.high <= prevCandle.high && lastCandle.low >= prevCandle.low) {
    signals.push('Inside bar detectado');
    score += 2;
  }
  
  // ❌ CRITÉRIO 3: Pavio grande contra tendência (> 50% do tamanho total)
  const upperWick = lastCandle.high - Math.max(lastCandle.open, lastCandle.close);
  const lowerWick = Math.min(lastCandle.open, lastCandle.close) - lastCandle.low;
  const wickAgainst = direction === 'BUY' ? upperWick : lowerWick;
  const wickPercent = lastTotal > 0 ? (wickAgainst / lastTotal) * 100 : 0;
  
  if (wickPercent > 50) {
    signals.push(`Pavio grande contra (${wickPercent.toFixed(1)}%)`);
    score += 3;
  }
  
  // ❌ CRITÉRIO 4: Duas velas laterais (range < 0.3% cada)
  const lateralCandles = recentCandles.filter(c => {
    const range = c.high - c.low;
    const rangePercent = c.open > 0 ? (range / c.open) * 100 : 0;
    return rangePercent < 0.3;
  });
  
  if (lateralCandles.length >= 2) {
    signals.push('Duas velas laterais (stalling)');
    score += 2;
  }
  
  // ❌ CRITÉRIO 5: Rompimento falho do micro pivot
  const highs = recentCandles.map(c => c.high);
  const lows = recentCandles.map(c => c.low);
  const maxHigh = Math.max(...highs);
  const minLow = Math.min(...lows);
  
  const failedBreakout = direction === 'BUY' 
    ? lastCandle.close < maxHigh * 0.995  // Não conseguiu superar máxima anterior
    : lastCandle.close > minLow * 1.005;  // Não conseguiu superar mínima anterior
  
  if (failedBreakout) {
    signals.push('Rompimento falho do pivot');
    score += 2;
  }
  
  // ❌ CRITÉRIO 6: Perda do ritmo (3+ velas sem progresso)
  const firstPrice = recentCandles[0].close;
  const lastPrice = lastCandle.close;
  const hasProgress = direction === 'BUY' 
    ? lastPrice > firstPrice * 1.001  // Progrediu > 0.1%
    : lastPrice < firstPrice * 0.999;
  
  if (!hasProgress) {
    signals.push('Perda do ritmo (sem progresso)');
    score += 2;
  }
  
  // DECISÃO: >= 4 pontos = fraqueza confirmada
  const hasWeakness = score >= 4;
  
  return { hasWeakness, signals, score };
}

/**
 * Decide se deve fechar a posição baseado em momentum
 */
export function shouldClosePosition(
  position: ActivePosition, 
  candles: Candle[]
): ClosureDecision {
  const rr = calculateCurrentRR(position);
  
  // Só analisa se RR entre 1.0 e 1.5
  if (rr < 1.0 || rr > 1.5) {
    return { 
      shouldClose: false, 
      reason: `RR ${rr.toFixed(2)} fora da zona de proteção (1.0-1.5)`,
      confidence: 0
    };
  }
  
  console.log(`🔍 ZONA DE PROTEÇÃO ATIVADA - RR ${rr.toFixed(2)}`);
  
  const continuity = analyzeContinuity(candles, position.direction);
  const weakness = analyzeWeakness(candles, position.direction);
  
  console.log(`📊 Análise de Momentum:`);
  console.log(`├─ Continuidade: ${continuity.hasContinuity ? '✅ SIM' : '❌ NÃO'} (Score: ${continuity.score})`);
  console.log(`│  └─ ${continuity.signals.join(', ')}`);
  console.log(`├─ Fraqueza: ${weakness.hasWeakness ? '🛑 SIM' : '✅ NÃO'} (Score: ${weakness.score})`);
  console.log(`│  └─ ${weakness.signals.join(', ')}`);
  
  // PRIORIDADE 1: Se fraqueza detectada, FECHAR
  if (weakness.hasWeakness) {
    return { 
      shouldClose: true, 
      reason: `🛑 Fraqueza detectada em RR ${rr.toFixed(2)}: ${weakness.signals.join(', ')}`,
      confidence: weakness.score / 10 // 0.4-1.0
    };
  }
  
  // PRIORIDADE 2: Se continuidade confirmada, MANTER
  if (continuity.hasContinuity) {
    return { 
      shouldClose: false, 
      reason: `✅ Continuidade confirmada em RR ${rr.toFixed(2)}: ${continuity.signals.join(', ')}`,
      confidence: continuity.score / 10 // 0.6-1.0
    };
  }
  
  // PRIORIDADE 3: Momentum indefinido, FECHAR (segurança)
  return { 
    shouldClose: true, 
    reason: `⚠️ Momentum indefinido em RR ${rr.toFixed(2)} - Garantindo lucro parcial`,
    confidence: 0.5
  };
}
