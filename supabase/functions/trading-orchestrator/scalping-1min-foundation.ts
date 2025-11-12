/**
 * MÓDULO DE DETECÇÃO DE FUNDAÇÃO - SCALPING 1 MINUTO
 * 
 * Detecta e armazena a primeira vela de 5 minutos de cada sessão.
 * Esta vela define os níveis HIGH e LOW que serão a base para todas as operações da sessão.
 */

interface SessionFoundation {
  high: number;
  low: number;
  timestamp: string;
  valid: boolean;
  session: string;
  date: string;
}

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * Horários de início de cada sessão (UTC)
 * CORRIGIDO: Alinhado com os horários reais das sessões
 */
const SESSION_START_TIMES = {
  OCEANIA: { hour: 0, minute: 0 },  // 00:00 UTC
  ASIA: { hour: 3, minute: 0 },     // 03:00 UTC
  LONDON: { hour: 8, minute: 0 },   // 08:00 UTC
  NY: { hour: 13, minute: 0 }       // 13:00 UTC
};

/**
 * Obtém ou cria a fundação da sessão atual
 */
export async function getOrCreateFoundation(
  session: string,
  candles5m: Candle[],
  userId: string,
  supabase: any
): Promise<SessionFoundation> {
  const today = new Date().toISOString().split('T')[0];
  
  // Tentar buscar fundação existente no banco
  const { data: existing, error: fetchError } = await supabase
    .from('session_foundation')
    .select('*')
    .eq('user_id', userId)
    .eq('session', session)
    .eq('date', today)
    .maybeSingle();
  
  if (fetchError) {
    console.error('❌ Erro ao buscar fundação:', fetchError);
  }
  
  if (existing) {
    console.log(`✅ Fundação existente para ${session}: HIGH ${existing.high} | LOW ${existing.low}`);
    return {
      high: Number(existing.high),
      low: Number(existing.low),
      timestamp: existing.timestamp,
      valid: true,
      session,
      date: today
    };
  }
  
  // Criar nova fundação baseada na primeira vela de 5min
  const foundation = detectSessionFoundation(candles5m, session);
  
  if (foundation.valid) {
    // Armazenar no banco
    const { error: insertError } = await supabase
      .from('session_foundation')
      .insert({
        user_id: userId,
        session,
        date: today,
        high: foundation.high,
        low: foundation.low,
        timestamp: foundation.timestamp
      });
    
    if (insertError) {
      console.error('❌ Erro ao salvar fundação:', insertError);
    } else {
      console.log(`\n🏗️ NOVA FUNDAÇÃO CRIADA - ${session}:`);
      console.log(`├─ HIGH: ${foundation.high}`);
      console.log(`├─ LOW: ${foundation.low}`);
      console.log(`├─ Timestamp: ${foundation.timestamp}`);
      console.log(`└─ Range: ${(foundation.high - foundation.low).toFixed(5)}`);
    }
  }
  
  return foundation;
}

/**
 * Detecta a primeira vela de 5 minutos da sessão
 */
function detectSessionFoundation(
  candles5m: Candle[],
  session: string
): SessionFoundation {
  if (!candles5m || candles5m.length === 0) {
    return {
      high: 0,
      low: 0,
      timestamp: '',
      valid: false,
      session,
      date: ''
    };
  }
  
  const sessionStart = SESSION_START_TIMES[session as keyof typeof SESSION_START_TIMES];
  if (!sessionStart) {
    console.error(`❌ Sessão inválida: ${session}`);
    return {
      high: 0,
      low: 0,
      timestamp: '',
      valid: false,
      session,
      date: ''
    };
  }
  
  // Encontrar a primeira vela de 5min após o início da sessão
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  
  todayUTC.setUTCHours(sessionStart.hour, sessionStart.minute, 0, 0);
  const sessionStartTimestamp = todayUTC.getTime();
  
  // Buscar vela que corresponde ao início da sessão (tolerância de 5 minutos)
  const foundationCandle = candles5m.find(candle => {
    const candleTime = candle.timestamp;
    const diff = Math.abs(candleTime - sessionStartTimestamp);
    return diff < 5 * 60 * 1000; // Tolerância de 5 minutos
  });
  
  if (!foundationCandle) {
    console.log(`⏳ Aguardando primeira vela de 5min para ${session} (início: ${todayUTC.toISOString()})`);
    return {
      high: 0,
      low: 0,
      timestamp: '',
      valid: false,
      session,
      date: ''
    };
  }
  
  const candleDate = new Date(foundationCandle.timestamp);
  
  return {
    high: foundationCandle.high,
    low: foundationCandle.low,
    timestamp: candleDate.toISOString(),
    valid: true,
    session,
    date: candleDate.toISOString().split('T')[0]
  };
}
