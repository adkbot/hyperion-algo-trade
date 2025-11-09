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
    const { asset, direction, entry_price, stop_loss, take_profit, risk_reward, position_size, timestamp } = await req.json();
    
    console.log(`🎯 AGENTE EXECUÇÃO E CONFLUÊNCIA - Validando ${asset}`);
    console.log(`Direction: ${direction} | Entry: $${entry_price} | R:R: ${risk_reward?.toFixed(2)}`);

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
    }

    const systemPrompt = `Você é um agente especialista em validação de execução de trades e análise de confluência.
Sua função é verificar se existem múltiplos fatores de confluência que justifiquem a execução do trade.

Analise:
1. Confluência de indicadores técnicos (RSI, VWMA, EMA, MACD, ATR)
2. Metodologia Wyckoff - Verifique se a fase do ciclo suporta a direção do trade
3. Volume Profile - Valide se a entrada está próxima de zonas de alto volume (POC) ou Value Area
4. Qualidade do setup de risco/recompensa (mínimo 2:1)
5. Posicionamento de entrada, stop e target
6. Timing de execução
7. Fatores de confirmação adicionais

**CRITICAL - Volume Profile Validation:**
- Entry deve estar próximo de POC ou dentro da Value Area para maior confluência
- Stop Loss deve estar abaixo/acima de zonas de baixo volume (LVN)
- Take Profit deve visar zonas de alto volume ou LVN para correção

**CRITICAL - Wyckoff Validation:**
- Trade LONG apenas em Accumulation (fim) ou Markup
- Trade SHORT apenas em Distribution (fim) ou Markdown
- Evite entradas contra a fase do ciclo

Seja rigoroso - apenas aprove execuções com alta confluência (3+ fatores convergentes).`;

    const userPrompt = `Valide a execução deste trade:

ATIVO: ${asset}
DIREÇÃO: ${direction}
PREÇO DE ENTRADA: $${entry_price}
STOP LOSS: $${stop_loss}
TAKE PROFIT: $${take_profit}
RISK/REWARD: ${risk_reward?.toFixed(2)}:1
TAMANHO DA POSIÇÃO: ${position_size?.toFixed(4)}

Avalie:
1. O Risk/Reward é adequado (mínimo 2:1)?
2. **Wyckoff:** A fase do ciclo suporta a direção do trade?
3. **Volume Profile:** A entrada está próxima do POC ou dentro da Value Area?
4. A entrada está em nível de confluência?
5. O stop loss está bem posicionado (abaixo/acima de LVN)?
6. O take profit é realista e visa zonas de volume?
7. Existem pelo menos 3 fatores de confluência?

Forneça:
1. Análise de confluência detalhada
2. **Análise Wyckoff:** Validação da fase do ciclo
3. **Análise Volume Profile:** Validação de níveis de volume (POC, VA, LVN)
4. Pontuação de confluência (0-100)
5. Fatores de confluência identificados
6. Decisão final: APROVAR / AGUARDAR / REJEITAR`;

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
          temperature: 0.2,
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

    console.log('✅ Validação de confluência concluída');
    console.log(`Análise: ${analysis.substring(0, 200)}...`);

    // Extract confluence score
    const scoreMatch = analysis.match(/(\d+)\/100|(\d+)%/);
    const confluenceScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 75;

    const decision = confluenceScore >= 80 ? 'APROVAR' : confluenceScore >= 60 ? 'AGUARDAR' : 'REJEITAR';

    return new Response(
      JSON.stringify({
        success: true,
        agent: 'Execução e Confluência',
        asset,
        analysis,
        confluenceScore,
        decision,
        approved: decision === 'APROVAR',
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in agente-execucao-confluencia:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
