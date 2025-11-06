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
    const { asset, result, entry_price, exit_price, pnl, direction, position_data, timestamp } = await req.json();
    
    console.log(`⚖️ AGENTE GESTÃO DE RISCO - Analisando fechamento ${asset}`);
    console.log(`Result: ${result} | Entry: $${entry_price} | Exit: $${exit_price} | PnL: $${pnl}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const systemPrompt = `Você é um agente especialista em gestão de risco e análise de performance de trades.
Sua função é analisar trades fechados e fornecer insights sobre a execução e gestão de risco.

Analise:
1. Qualidade da execução do trade
2. Gestão de risco durante a operação
3. Razões do resultado (WIN/LOSS)
4. **Análise Wyckoff:** O trade estava alinhado com a fase correta do ciclo?
5. **Análise Volume Profile:** A entrada/saída respeitou zonas de volume (POC, VA, LVN)?
6. Lições aprendidas com base em Wyckoff e Volume Profile
7. Ajustes sugeridos para futuros trades

**CRITICAL - Post-Trade Analysis:**
- Avalie se o preço corrigiu até zonas de volume esperadas (LVN, POC)
- Verifique se a fase Wyckoff mudou durante o trade
- Identifique se o stop/target estava bem posicionado em relação ao Volume Profile

Seja objetivo e focado em melhoria contínua.`;

    const userPrompt = `Analise este trade finalizado:

ATIVO: ${asset}
RESULTADO: ${result}
DIREÇÃO: ${direction}
PREÇO DE ENTRADA: $${entry_price}
PREÇO DE SAÍDA: $${exit_price}
PnL: $${pnl?.toFixed(2)}

${position_data ? `DADOS DA POSIÇÃO:
${JSON.stringify(position_data, null, 2)}` : ''}

Forneça:
1. Análise do resultado
2. **Análise Wyckoff:** A fase do ciclo estava correta?
3. **Análise Volume Profile:** O preço respeitou as zonas de volume? Corrigiu até LVN/POC conforme esperado?
4. Avaliação da gestão de risco (0-100)
5. Principais lições aprendidas (incluindo insights de Wyckoff e Volume Profile)
6. Sugestões de melhoria
7. Se foi WIN: O que funcionou bem? (Wyckoff e Volume Profile estavam alinhados?)
8. Se foi LOSS: O que pode ser melhorado? (Ignorou sinais de Wyckoff ou Volume Profile?)`;

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
        temperature: 0.4,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI Gateway error:', aiResponse.status, errorText);
      throw new Error(`AI Gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysis = aiData.choices[0].message.content;

    console.log('✅ Análise de gestão de risco concluída');
    console.log(`Insights: ${analysis.substring(0, 200)}...`);

    // Extract risk management score
    const scoreMatch = analysis.match(/(\d+)\/100|(\d+)%/);
    const riskManagementScore = scoreMatch ? parseInt(scoreMatch[1] || scoreMatch[2]) : 70;

    return new Response(
      JSON.stringify({
        success: true,
        agent: 'Gestão de Risco',
        asset,
        result,
        analysis,
        riskManagementScore,
        pnl,
        lessons: analysis.includes('lições') || analysis.includes('aprendidas') ? 'Identificadas' : 'Não identificadas',
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in agente-gestao-risco:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
