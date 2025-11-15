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
 * ATUALIZADO: Conforme PDF "1ª Vela 5min" com todos os mercados
 */
const SESSION_START_TIMES = {
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
  
  // Mantém sessões genéricas para compatibilidade
  OCEANIA: { hour: 23, minute: 0 },     // Mapeado para SYDNEY
  ASIA: { hour: 0, minute: 0 }          // Mapeado para TOKYO
};

/**
 * Mapeia sessões TRANSITION ou genéricas para a sessão específica ativa
 */
function mapTransitionToRealSession(session: string): string {
  if (session !== 'TRANSITION' && session !== 'OCEANIA' && session !== 'ASIA') {
    return session;
  }
  
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const timeInMinutes = utcHour * 60 + utcMinute;
  
  // WELLINGTON: 21:00 UTC
  if (timeInMinutes >= 21 * 60 && timeInMinutes < 23 * 60) return 'WELLINGTON';
  
  // SYDNEY: 23:00 UTC
  if (timeInMinutes >= 23 * 60 || timeInMinutes < 0) return 'SYDNEY';
  
  // TOKYO: 00:00 UTC
  if (timeInMinutes >= 0 && timeInMinutes < 1 * 60) return 'TOKYO';
  
  // SINGAPORE: 01:00 UTC
  if (timeInMinutes >= 1 * 60 && timeInMinutes < 1 * 60 + 30) return 'SINGAPORE';
  
  // HONG_KONG: 01:30 UTC
  if (timeInMinutes >= 1 * 60 + 30 && timeInMinutes < 8 * 60) return 'HONG_KONG';
  
  // LONDON: 08:00 UTC
  if (timeInMinutes >= 8 * 60 && timeInMinutes < 14 * 60 + 30) return 'LONDON';
  
  // NY: 14:30 UTC (ou 13:30 durante horário de verão)
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11;
  const nyStartMinute = isDST ? 13 * 60 + 30 : 14 * 60 + 30;
  
  if (timeInMinutes >= nyStartMinute && timeInMinutes < 21 * 60) return 'NY';
  
  // Fallback: SYDNEY para período noturno
  console.log(`⚠️ Horário não mapeado (${utcHour}:${utcMinute}), usando SYDNEY como fallback`);
  return 'SYDNEY';
}

/**
 * Obtém ou cria a fundação da sessão atual
 */
export async function getOrCreateFoundation(
  session: string,
  candles5m: Candle[],
  userId: string,
  supabase: any
): Promise<SessionFoundation> {
  // Mapear TRANSITION para a próxima sessão real
  const realSession = mapTransitionToRealSession(session);
  
  if (session === 'TRANSITION') {
    console.log(`🔄 TRANSITION detectado - usando foundation da sessão ${realSession}`);
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  // Tentar buscar fundação existente no banco (usando a sessão real)
  const { data: existing, error: fetchError } = await supabase
    .from('session_foundation')
    .select('*')
    .eq('user_id', userId)
    .eq('session', realSession)
    .eq('date', today)
    .maybeSingle();
  
  if (fetchError) {
    console.error('❌ Erro ao buscar fundação:', fetchError);
  }
  
  if (existing) {
    console.log(`✅ Fundação existente para ${realSession}: HIGH ${existing.high} | LOW ${existing.low}`);
    return {
      high: Number(existing.high),
      low: Number(existing.low),
      timestamp: existing.timestamp,
      valid: true,
      session: realSession,
      date: today
    };
  }
  
  // Criar nova fundação baseada na primeira vela de 5min (usando sessão real)
  const foundation = detectSessionFoundation(candles5m, realSession);
  
  if (foundation.valid) {
    // Armazenar no banco (usando sessão real)
    const { error: insertError } = await supabase
      .from('session_foundation')
      .insert({
        user_id: userId,
        session: realSession,
        date: today,
        high: foundation.high,
        low: foundation.low,
        timestamp: foundation.timestamp
      });
    
    if (insertError) {
      console.error('❌ Erro ao salvar fundação:', insertError);
    } else {
      console.log(`\n🏗️ NOVA FUNDAÇÃO CRIADA - ${realSession}:`);
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
