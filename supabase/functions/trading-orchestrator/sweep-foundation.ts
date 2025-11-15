/**
 * MÓDULO DE DETECÇÃO DE FUNDAÇÃO - SWEEP LIQUIDITY
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
 * ATUALIZADO: 7 sessões de mercado para SWEEP_LIQUIDITY
 */
const SESSION_START_TIMES = {
  // OCEANIA
  WELLINGTON: { hour: 21, minute: 0 },  // 21:00 UTC
  SYDNEY: { hour: 23, minute: 0 },      // 23:00 UTC
  
  // ÁSIA
  SINGAPORE: { hour: 1, minute: 0 },    // 01:00 UTC
  HONG_KONG: { hour: 1, minute: 30 },   // 01:30 UTC
  TOKYO: { hour: 0, minute: 0 },        // 00:00 UTC
  
  // EUROPA
  LONDON: { hour: 8, minute: 0 },       // 08:00 UTC
  
  // AMÉRICA
  NY: { hour: 14, minute: 30 },         // 14:30 UTC (13:30 durante DST)
  
  // Mantém sessões genéricas para compatibilidade
  OCEANIA: { hour: 23, minute: 0 },     // Mapeado para SYDNEY
  ASIA: { hour: 0, minute: 0 }          // Mapeado para TOKYO
};

/**
 * Mapeia sessões genéricas para a sessão específica ativa
 */
function mapToRealSession(session: string): string {
  if (!['OCEANIA', 'ASIA', 'TRANSITION'].includes(session)) {
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
  
  // NY: 14:30 UTC (ou 13:30 durante DST)
  const month = now.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 11;
  const nyStartMinute = isDST ? 13 * 60 + 30 : 14 * 60 + 30;
  
  if (timeInMinutes >= nyStartMinute && timeInMinutes < 21 * 60) return 'NY';
  
  // Fallback: SYDNEY
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
  const realSession = mapToRealSession(session);
  
  if (['TRANSITION', 'OCEANIA', 'ASIA'].includes(session)) {
    console.log(`🔄 ${session} detectado - usando foundation da sessão ${realSession}`);
  }
  
  const today = new Date().toISOString().split('T')[0];
  
  // Tentar buscar fundação existente no banco
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
      high: existing.high,
      low: existing.low,
      timestamp: existing.timestamp,
      valid: true,
      session: realSession,
      date: today
    };
  }
  
  // Criar nova fundação detectando primeira vela de 5 minutos
  console.log(`🔍 Detectando nova fundação para ${realSession}...`);
  const foundation = detectSessionFoundation(candles5m, realSession);
  
  if (!foundation.valid) {
    console.log(`❌ Fundação inválida para ${realSession}`);
    return foundation;
  }
  
  // Salvar no banco
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
    console.log(`✅ Fundação salva para ${realSession}: HIGH ${foundation.high} | LOW ${foundation.low}`);
  }
  
  return foundation;
}

/**
 * Detecta a primeira vela de 5 minutos da sessão
 */
export function detectSessionFoundation(
  candles5m: Candle[],
  session: string
): SessionFoundation {
  const sessionStart = SESSION_START_TIMES[session as keyof typeof SESSION_START_TIMES];
  
  if (!sessionStart) {
    console.log(`⚠️ Sessão desconhecida: ${session}`);
    return {
      high: 0,
      low: 0,
      timestamp: new Date().toISOString(),
      valid: false,
      session,
      date: new Date().toISOString().split('T')[0]
    };
  }
  
  const targetTime = sessionStart.hour * 60 + sessionStart.minute; // Minutos desde meia-noite UTC
  const tolerance = 5; // 5 minutos de tolerância
  
  console.log(`🔍 Buscando primeira vela de 5min para ${session} (${sessionStart.hour}:${String(sessionStart.minute).padStart(2, '0')} UTC)`);
  
  // Buscar primeira vela que coincide com o horário de início da sessão
  for (const candle of candles5m) {
    const candleDate = new Date(candle.timestamp);
    const candleMinutes = candleDate.getUTCHours() * 60 + candleDate.getUTCMinutes();
    
    const diff = Math.abs(candleMinutes - targetTime);
    
    if (diff <= tolerance) {
      console.log(`✅ Primeira vela 5min encontrada para ${session}:`);
      console.log(`   ├─ Timestamp: ${candleDate.toISOString()}`);
      console.log(`   ├─ HIGH: ${candle.high}`);
      console.log(`   └─ LOW: ${candle.low}`);
      
      return {
        high: candle.high,
        low: candle.low,
        timestamp: candleDate.toISOString(),
        valid: true,
        session,
        date: new Date().toISOString().split('T')[0]
      };
    }
  }
  
  console.log(`⚠️ Primeira vela de 5min não encontrada para ${session}`);
  return {
    high: 0,
    low: 0,
    timestamp: new Date().toISOString(),
    valid: false,
    session,
    date: new Date().toISOString().split('T')[0]
  };
}
