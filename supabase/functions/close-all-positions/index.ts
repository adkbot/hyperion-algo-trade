// ============================================
// CLOSE ALL POSITIONS - BOTÃO DE EMERGÊNCIA
// ============================================
// Fecha TODAS as posições na Binance e limpa o banco de dados

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      throw new Error('user_id obrigatório');
    }

    console.log(`🚨 EMERGÊNCIA - Fechando TODAS as posições para user: ${user_id}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar configurações do usuário
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      throw new Error('Configurações não encontradas');
    }

    // 2. Se paper mode, apenas limpar DB
    if (settings.paper_mode) {
      console.log('📝 Paper mode - Limpando apenas o banco de dados');
      
      const { error: deleteError } = await supabaseAdmin
        .from('active_positions')
        .delete()
        .eq('user_id', user_id);

      if (deleteError) throw deleteError;

      return new Response(
        JSON.stringify({
          success: true,
          paper_mode: true,
          message: 'Todas as posições do paper mode foram removidas',
          closed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Modo real - Buscar posições da Binance
    if (!settings.api_key || !settings.api_secret) {
      throw new Error('API keys não configuradas');
    }

    const timestamp = Date.now();
    const params = new URLSearchParams({
      timestamp: timestamp.toString(),
      recvWindow: '60000',
    });

    const signature = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(settings.api_secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    ).then(key =>
      crypto.subtle.sign(
        'HMAC',
        key,
        new TextEncoder().encode(params.toString())
      )
    ).then(signature =>
      Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
    );

    params.append('signature', signature);

    const binanceResponse = await fetch(
      `https://fapi.binance.com/fapi/v2/positionRisk?${params}`,
      {
        headers: {
          'X-MBX-APIKEY': settings.api_key,
        },
      }
    );

    if (!binanceResponse.ok) {
      const errorText = await binanceResponse.text();
      throw new Error(`Binance API error: ${errorText}`);
    }

    const binancePositions = await binanceResponse.json();
    const activeBinancePositions = binancePositions.filter(
      (pos: any) => parseFloat(pos.positionAmt) !== 0
    );

    console.log(`📊 Posições ativas encontradas: ${activeBinancePositions.length}`);

    // 4. Fechar cada posição na Binance
    let closedCount = 0;
    for (const pos of activeBinancePositions) {
      const quantity = Math.abs(parseFloat(pos.positionAmt));
      const side = parseFloat(pos.positionAmt) > 0 ? 'SELL' : 'BUY';

      console.log(`🔴 Fechando ${pos.symbol}: ${side} ${quantity}`);

      const closeTimestamp = Date.now();
      const closeParams = new URLSearchParams({
        symbol: pos.symbol,
        side: side,
        type: 'MARKET',
        quantity: quantity.toString(),
        timestamp: closeTimestamp.toString(),
        recvWindow: '60000',
      });

      const closeSignature = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(settings.api_secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      ).then(key =>
        crypto.subtle.sign(
          'HMAC',
          key,
          new TextEncoder().encode(closeParams.toString())
        )
      ).then(signature =>
        Array.from(new Uint8Array(signature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('')
      );

      closeParams.append('signature', closeSignature);

      const closeResponse = await fetch(
        `https://fapi.binance.com/fapi/v1/order?${closeParams}`,
        {
          method: 'POST',
          headers: {
            'X-MBX-APIKEY': settings.api_key,
          },
        }
      );

      if (closeResponse.ok) {
        closedCount++;
        console.log(`✅ ${pos.symbol} fechado com sucesso`);
      } else {
        const errorText = await closeResponse.text();
        console.error(`❌ Erro ao fechar ${pos.symbol}:`, errorText);
      }
    }

    // 5. Limpar banco de dados
    const { error: deleteError } = await supabaseAdmin
      .from('active_positions')
      .delete()
      .eq('user_id', user_id);

    if (deleteError) {
      console.error('Erro ao limpar DB:', deleteError);
    }

    console.log(`✅ Emergência concluída: ${closedCount} posições fechadas`);

    return new Response(
      JSON.stringify({
        success: true,
        paper_mode: false,
        closed: closedCount,
        message: `${closedCount} posições foram fechadas e o banco de dados foi limpo`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro na emergência:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
