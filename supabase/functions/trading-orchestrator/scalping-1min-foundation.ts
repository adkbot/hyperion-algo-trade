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
    // Log otimizado
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
      console.log(`✅ NOVA FOUNDATION: ${realSession} | HIGH: ${foundation.high} | LOW: ${foundation.low}`);
    }
  }
  
  return foundation;
}

/**
 * Detecta a primeira vela de 5 minutos da sessão
 */
/**
 * Detecta a primeira vela de 5 minutos da sessão
 * ATUALIZADO: Busca flexível - primeira vela APÓS o horário de início
 */
function detectSessionFoundation(
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
  
  if (!candles5m || candles5m.length === 0) {
    console.log(`⚠️ Nenhuma vela de 5min disponível para ${session}`);
    return {
      high: 0,
      low: 0,
      timestamp: new Date().toISOString(),
      valid: false,
      session,
      date: new Date().toISOString().split('T')[0]
    };
  }
  
  const targetTime = sessionStart.hour * 60 + sessionStart.minute;
  // Log reduzido
  
  // Ordenar velas por timestamp (mais antigas primeiro)
  const sortedCandles = [...candles5m].sort((a, b) => a.timestamp - b.timestamp);
  
  // ESTRATÉGIA 1: Buscar primeira vela >= horário de início (janela de 30min)
  for (const candle of sortedCandles) {
    const candleDate = new Date(candle.timestamp);
    const candleMinutes = candleDate.getUTCHours() * 60 + candleDate.getUTCMinutes();
    
    // Aceita qualquer vela dentro de 30min APÓS o início
    if (candleMinutes >= targetTime && candleMinutes <= targetTime + 30) {
      console.log(`✅ Foundation: ${session} | ${candleDate.getUTCHours()}:${String(candleDate.getUTCMinutes()).padStart(2, '0')} | H:${candle.high} L:${candle.low}`);
      
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
  
  // ESTRATÉGIA 2: Fallback - usar vela mais recente disponível
  const mostRecentCandle = sortedCandles[sortedCandles.length - 1];
  const mostRecentDate = new Date(mostRecentCandle.timestamp);
  
  console.log(`⚠️ FALLBACK Foundation: ${session} | ${mostRecentDate.getUTCHours()}:${String(mostRecentDate.getUTCMinutes()).padStart(2, '0')}`);
  
  return {
    high: mostRecentCandle.high,
    low: mostRecentCandle.low,
    timestamp: mostRecentDate.toISOString(),
    valid: true,
    session,
    date: new Date().toISOString().split('T')[0]
  };
}
