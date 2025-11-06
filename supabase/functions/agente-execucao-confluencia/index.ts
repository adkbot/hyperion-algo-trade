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

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Você é um agente especialista em validação de execução de trades e análise de confluência.
Sua função é verificar se existem múltiplos fatores de confluência que justifiquem a execução do trade.

Analise:
1. Confluência de indicadores técnicos
2. Qualidade do setup de risco/recompensa
3. Posicionamento de entrada, stop e target
4. Timing de execução
5. Fatores de confirmação adicionais

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
2. A entrada está em nível de confluência?
3. O stop loss está bem posicionado?
4. O take profit é realista?
5. Existem pelo menos 3 fatores de confluência?

Forneça:
1. Análise de confluência detalhada
2. Pontuação de confluência (0-100)
3. Fatores de confluência identificados
4. Decisão final: APROVAR / AGUARDAR / REJEITAR`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

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
