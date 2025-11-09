import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { asset, session, phase, signal, confidence, direction, risk, marketData, timestamp } = await req.json();
    
    console.log(`🤖 AGENTE FEEDBACK ANALÍTICO - Analisando ${asset}`);
    console.log(`Session: ${session} | Phase: ${phase} | Signal: ${signal} | Confidence: ${(confidence * 100).toFixed(1)}%`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    // Prepare detailed market analysis prompt
    const systemPrompt = `Você é um agente especialista em análise técnica de mercado financeiro.
Sua função é avaliar sinais de trading e fornecer feedback analítico profundo sobre a qualidade do sinal.

Analise os seguintes aspectos:
1. Força do sinal baseado nos indicadores técnicos (RSI, VWMA, EMA, MACD, ATR)
2. Confluência entre múltiplos indicadores
3. Contexto da sessão de mercado atual
4. Metodologia Wyckoff - Identifique a fase do ciclo (Acumulação, Mark Up, Distribuição, Mark Down)
5. Volume Profile - Analise zonas de alto volume (POC), áreas de valor e zonas de baixo volume
6. Qualidade do setup de risco/recompensa
7. Fatores que podem validar ou invalidar o sinal

**CRITICAL - Volume Profile Analysis:**
- Identifique o POC (Point of Control) - nível de maior volume
- Marque Value Area (VA) - região com 70% do volume (20 níveis)
- Identifique zonas de baixo volume (LVN) - possíveis alvos de correção
- Analise se o preço está acima/abaixo do POC
- Use 200 linhas de análise para precisão máxima

**CRITICAL - Wyckoff Analysis:**
- Identifique a fase atual do mercado (Accumulation, Markup, Distribution, Markdown)
- Analise eventos (Spring, Upthrust, Test)
- Verifique volume em pontos-chave

Seja objetivo, técnico e forneça uma pontuação de 0-100 para a qualidade do sinal.`;

    const userPrompt = `Analise este sinal de trading:

ATIVO: ${asset}
SESSÃO: ${session} (Fase: ${phase})
SINAL: ${signal}
DIREÇÃO: ${direction}
CONFIANÇA INICIAL: ${(confidence * 100).toFixed(1)}%

DADOS DE MERCADO:
- Preço Atual: $${marketData?.price || 'N/A'}
- RSI: ${marketData?.rsi?.toFixed(2) || 'N/A'}
- VWMA: ${marketData?.vwma?.toFixed(2) || 'N/A'}
- EMA: ${marketData?.ema?.toFixed(2) || 'N/A'}
- MACD: ${JSON.stringify(marketData?.macd) || 'N/A'}
- ATR: ${marketData?.atr?.toFixed(2) || 'N/A'}

${risk ? `GESTÃO DE RISCO:
- Entrada: $${risk.entry}
- Stop Loss: $${risk.stop}
- Take Profit: $${risk.target}
- Risk/Reward: ${risk.rr_ratio?.toFixed(2)}` : 'Sem dados de risco'}

Forneça:
1. Análise detalhada da qualidade do sinal
2. **Análise Wyckoff:** Identifique a fase do ciclo e eventos importantes
3. **Análise Volume Profile:** Identifique POC, Value Area, e zonas de baixo volume. Determine se o preço está em zona de suporte/resistência baseada em volume
4. Pontuação de qualidade (0-100)
5. Principais pontos de atenção
6. Níveis de correção esperados baseados em Volume Profile
7. Recomendação final (EXECUTAR / AGUARDAR / REJEITAR)`;

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\n${userPrompt}`
          }]
        }],
        generationConfig: {
          temperature: 0.3,
        }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Gemini API error:', aiResponse.status, errorText);
      throw new Error(`Gemini API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.candidates[0].content.parts[0].text;

    console.log('✅ Análise IA concluída');
    console.log(`Feedback: ${analysis.substring(0, 200)}...`);

    // Extract quality score from analysis (simplified - in production, use tool calling)
    const scoreMatch = analysis.match(/(\d+)\/100|(\d+)%/);
    const qualityScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : confidence * 100;

    return new Response(
      JSON.stringify({
        success: true,
        agent: 'Feedback Analítico',
        asset,
        analysis,
        qualityScore,
        originalConfidence: confidence,
        adjustedConfidence: qualityScore / 100,
        recommendation: qualityScore >= 80 ? 'EXECUTAR' : qualityScore >= 60 ? 'AGUARDAR' : 'REJEITAR',
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in agente-feedback-analitico:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
