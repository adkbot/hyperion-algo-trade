// ============================================
// FIRST CANDLE RULE - FOUNDATION DETECTION
// ============================================
// Detecta a primeira vela de 5 minutos de cada ciclo
// e marca First 5-min High e First 5-min Low

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FirstCandleFoundation {
  high: number;
  low: number;
  timestamp: number;
  session: string;
  date: string;
  isValid: boolean;
}

// Horários de início dos ciclos (UTC)
const CYCLE_START_TIMES = {
  PRIMEIRA_HORA: { hour: 13, minute: 30 }, // 09:30 NY (primeira hora após abertura)
  NY: { hour: 14, minute: 30 },            // 10:30 NY
  ASIA: { hour: 0, minute: 0 },            // 00:00 UTC
  OCEANIA: { hour: 22, minute: 0 },        // 22:00 UTC (dia anterior)
};

/**
 * Identifica qual ciclo está ativo no momento
 */
function getCurrentCycle(): string {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  
  // PRIMEIRA_HORA: 13:30 - 14:30 UTC
  if (hour === 13 && minute >= 30) return 'PRIMEIRA_HORA';
  
  // NY: 14:30 - 22:00 UTC
  if (hour === 14 && minute >= 30) return 'NY';
  if (hour > 14 && hour < 22) return 'NY';
  
  // OCEANIA: 22:00 - 00:00 UTC
  if (hour >= 22) return 'OCEANIA';
  
  // ASIA: 00:00 - 13:30 UTC
  if (hour < 13 || (hour === 13 && minute < 30)) return 'ASIA';
  
  return 'NY'; // Default
}

/**
 * Busca ou cria a foundation da primeira vela de 5 min
 */
export async function getOrCreateFirstCandleFoundation(
  candles5m: Candle[],
  userId: string,
  supabase: any
): Promise<FirstCandleFoundation> {
  const cycle = getCurrentCycle();
  const today = new Date().toISOString().split('T')[0];
  
  // Tentar buscar foundation existente para este ciclo hoje
  const { data: existing } = await supabase
    .from('session_foundation')
    .select('*')
    .eq('user_id', userId)
    .eq('session', cycle)
    .eq('date', today)
    .single();
  
  if (existing) {
    console.log(`✅ Foundation encontrada para ${cycle}: High ${existing.high}, Low ${existing.low}`);
    return {
      high: existing.high,
      low: existing.low,
      timestamp: new Date(existing.timestamp).getTime(),
      session: cycle,
      date: today,
      isValid: true,
    };
  }
  
  // Detectar primeira vela de 5 min do ciclo
  const foundation = detectFirstCandle(candles5m, cycle);
  
  if (!foundation.isValid) {
    console.log(`⚠️ Primeira vela de 5 min ainda não disponível para ${cycle}`);
    return foundation;
  }
  
  // Salvar no banco
  const { error } = await supabase
    .from('session_foundation')
    .insert({
      user_id: userId,
      session: cycle,
      date: today,
      high: foundation.high,
      low: foundation.low,
      timestamp: new Date(foundation.timestamp).toISOString(),
    });
  
  if (error) {
    console.error('❌ Erro ao salvar foundation:', error);
  } else {
    console.log(`💾 Foundation salva - ${cycle}: High ${foundation.high}, Low ${foundation.low}`);
  }
  
  return foundation;
}

/**
 * Detecta a primeira vela de 5 min do ciclo atual
 */
function detectFirstCandle(candles5m: Candle[], cycle: string): FirstCandleFoundation {
  if (!candles5m || candles5m.length === 0) {
    return {
      high: 0,
      low: 0,
      timestamp: 0,
      session: cycle,
      date: new Date().toISOString().split('T')[0],
      isValid: false,
    };
  }
  
  const cycleStart = CYCLE_START_TIMES[cycle as keyof typeof CYCLE_START_TIMES];
  if (!cycleStart) {
    console.error(`❌ Ciclo inválido: ${cycle}`);
    return {
      high: 0,
      low: 0,
      timestamp: 0,
      session: cycle,
      date: new Date().toISOString().split('T')[0],
      isValid: false,
    };
  }
  
  // Buscar a primeira vela de 5 min que coincide com o horário de início do ciclo
  const now = new Date();
  const targetTime = new Date(now);
  targetTime.setUTCHours(cycleStart.hour, cycleStart.minute, 0, 0);
  
  // Se OCEANIA, pode ser do dia anterior
  if (cycle === 'OCEANIA' && now.getUTCHours() < 22) {
    targetTime.setDate(targetTime.getDate() - 1);
  }
  
  const targetTimestamp = targetTime.getTime();
  const tolerance = 5 * 60 * 1000; // 5 minutos de tolerância
  
  // Encontrar a vela mais próxima do horário de início
  const firstCandle = candles5m.find(candle => {
    const candleTime = candle.timestamp;
    return Math.abs(candleTime - targetTimestamp) <= tolerance;
  });
  
  if (!firstCandle) {
    console.log(`⏳ Aguardando primeira vela de 5 min para ${cycle} (alvo: ${targetTime.toISOString()})`);
    return {
      high: 0,
      low: 0,
      timestamp: 0,
      session: cycle,
      date: new Date().toISOString().split('T')[0],
      isValid: false,
    };
  }
  
  console.log(`🎯 Primeira vela de 5 min detectada para ${cycle}:`);
  console.log(`   High: ${firstCandle.high}`);
  console.log(`   Low: ${firstCandle.low}`);
  console.log(`   Time: ${new Date(firstCandle.timestamp).toISOString()}`);
  
  return {
    high: firstCandle.high,
    low: firstCandle.low,
    timestamp: firstCandle.timestamp,
    session: cycle,
    date: new Date().toISOString().split('T')[0],
    isValid: true,
  };
}
