// ============================================
// FIRST CANDLE FOUNDATION - 15M TIMEFRAME
// ============================================
// Detecta e armazena a primeira vela de 15 minutos do DIA
// Diferente do 5m que é por sessão, este é válido o DIA TODO

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Foundation15m {
  high: number;
  low: number;
  timestamp: number;
  isValid: boolean;
  date: string;
}

/**
 * Busca ou cria a foundation de 15m para o dia atual
 * A foundation é a primeira vela de 15m do dia (00:00 UTC)
 */
export async function getOrCreateFoundation15m(
  candles15m: Candle[],
  userId: string,
  supabase: any
): Promise<Foundation15m> {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  console.log(`📊 Buscando Foundation 15m para ${today}...`);
  
  // Tentar buscar foundation existente no banco
  const { data: existingFoundation, error: fetchError } = await supabase
    .from('session_foundation')
    .select('*')
    .eq('user_id', userId)
    .eq('session', 'DAY') // Identificador especial para foundation do dia
    .eq('date', today)
    .eq('timeframe', '15m')
    .maybeSingle();
  
  if (fetchError) {
    console.error('❌ Erro ao buscar foundation 15m:', fetchError);
  }
  
  // Se já existe, retornar
  if (existingFoundation) {
    console.log(`✅ Foundation 15m encontrada no banco: $${existingFoundation.high} / $${existingFoundation.low}`);
    return {
      high: Number(existingFoundation.high),
      low: Number(existingFoundation.low),
      timestamp: new Date(existingFoundation.timestamp).getTime(),
      isValid: true,
      date: today
    };
  }
  
  // Detectar nova foundation
  const detectedFoundation = detectFirstCandle15m(candles15m, today);
  
  if (!detectedFoundation.isValid) {
    console.log('⏳ Primeira vela de 15m do dia ainda não disponível');
    return detectedFoundation;
  }
  
  // Salvar no banco
  console.log(`💾 Salvando Foundation 15m no banco...`);
  const { error: insertError } = await supabase
    .from('session_foundation')
    .insert({
      user_id: userId,
      session: 'DAY',
      date: today,
      high: detectedFoundation.high,
      low: detectedFoundation.low,
      timestamp: new Date(detectedFoundation.timestamp).toISOString(),
      timeframe: '15m',
      validity_type: 'DAY_15MIN'
    });
  
  if (insertError) {
    console.error('❌ Erro ao salvar foundation 15m:', insertError);
  } else {
    console.log(`✅ Foundation 15m salva: $${detectedFoundation.high} / $${detectedFoundation.low}`);
  }
  
  return detectedFoundation;
}

/**
 * Detecta a primeira vela de 15 minutos do dia (00:00 UTC)
 */
function detectFirstCandle15m(candles15m: Candle[], date: string): Foundation15m {
  if (!candles15m || candles15m.length === 0) {
    return {
      high: 0,
      low: 0,
      timestamp: 0,
      isValid: false,
      date
    };
  }
  
  // Target: 00:00 UTC do dia em questão
  const targetDate = new Date(date + 'T00:00:00Z');
  const targetTimestamp = targetDate.getTime();
  
  console.log(`🔍 Procurando primeira vela 15m em ${targetDate.toISOString()}`);
  
  // Tolerância de 15 minutos (± 15 min)
  const tolerance = 15 * 60 * 1000;
  
  // Procurar vela mais próxima de 00:00 UTC
  let closestCandle: Candle | null = null;
  let minDiff = Infinity;
  
  for (const candle of candles15m) {
    const candleTime = new Date(candle.timestamp).getTime();
    const diff = Math.abs(candleTime - targetTimestamp);
    
    // Se dentro da tolerância e mais próxima
    if (diff <= tolerance && diff < minDiff) {
      minDiff = diff;
      closestCandle = candle;
    }
  }
  
  if (!closestCandle) {
    console.log('❌ Primeira vela 15m do dia não encontrada');
    return {
      high: 0,
      low: 0,
      timestamp: 0,
      isValid: false,
      date
    };
  }
  
  console.log(`✅ Primeira vela 15m detectada: ${new Date(closestCandle.timestamp).toISOString()}`);
  console.log(`   High: $${closestCandle.high} | Low: $${closestCandle.low}`);
  
  return {
    high: closestCandle.high,
    low: closestCandle.low,
    timestamp: new Date(closestCandle.timestamp).getTime(),
    isValid: true,
    date
  };
}
