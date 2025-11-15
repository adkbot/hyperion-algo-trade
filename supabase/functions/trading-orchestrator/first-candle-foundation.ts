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

// Horários de início dos ciclos (UTC) - ATUALIZADO conforme PDF "1ª Vela 5min"
const CYCLE_START_TIMES = {
  // OCEANIA
  WELLINGTON: { hour: 21, minute: 0 },  // 10:00 local = 21:00 UTC (dia anterior) = 18:00 Brasil
  SYDNEY: { hour: 23, minute: 0 },      // 10:00 local = 23:00 UTC (dia anterior) = 20:00 Brasil
  
  // ÁSIA
  SINGAPORE: { hour: 1, minute: 0 },    // 09:00 local = 01:00 UTC = 22:00 Brasil (dia anterior)
  HONG_KONG: { hour: 1, minute: 30 },   // 09:30 local = 01:30 UTC = 22:30 Brasil (dia anterior)
  TOKYO: { hour: 0, minute: 0 },        // 09:00 JST = 00:00 UTC = 21:00 Brasil (dia anterior)
  
  // EUROPA
  LONDON: { hour: 8, minute: 0 },       // 08:00 local = 08:00 UTC = 05:00 Brasil
  
  // AMÉRICA
  NY: { hour: 14, minute: 30 },         // 09:30 EST = 14:30 UTC = 11:30 Brasil
  // Durante horário de verão NY (EDT): 13:30 UTC = 10:30 Brasil
};

/**
 * Identifica qual ciclo/mercado está ativo no momento
 * Baseado nos horários de abertura do PDF "1ª Vela 5min"
 */
function getCurrentCycle(): string {
  const now = new Date();
  const hour = now.getUTCHours();
  const minute = now.getUTCMinutes();
  const timeInMinutes = hour * 60 + minute;
  
  // WELLINGTON: 21:00 UTC (dia anterior)
  if (timeInMinutes >= 21 * 60 && timeInMinutes < 23 * 60) return 'WELLINGTON';
  
  // SYDNEY: 23:00 UTC (dia anterior)
  if (timeInMinutes >= 23 * 60 || timeInMinutes < 1 * 60) return 'SYDNEY';
  
  // TOKYO: 00:00 UTC
  if (timeInMinutes >= 0 && timeInMinutes < 1 * 60) return 'TOKYO';
  
  // SINGAPORE: 01:00 UTC
  if (timeInMinutes >= 1 * 60 && timeInMinutes < 1 * 60 + 30) return 'SINGAPORE';
  
  // HONG_KONG: 01:30 UTC
  if (timeInMinutes >= 1 * 60 + 30 && timeInMinutes < 8 * 60) return 'HONG_KONG';
  
  // LONDON: 08:00 UTC
  if (timeInMinutes >= 8 * 60 && timeInMinutes < 14 * 60 + 30) return 'LONDON';
  
  // NY: 14:30 UTC (ou 13:30 durante horário de verão)
  // Detectar horário de verão (aproximado: março-novembro)
  const month = now.getUTCMonth() + 1; // 1-12
  const isDST = month >= 3 && month <= 11;
  const nyStartMinute = isDST ? 13 * 60 + 30 : 14 * 60 + 30;
  
  if (timeInMinutes >= nyStartMinute && timeInMinutes < 21 * 60) return 'NY';
  
  return 'SYDNEY'; // Default para período noturno
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
