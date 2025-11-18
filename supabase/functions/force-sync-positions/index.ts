// ============================================
// FORCE SYNC POSITIONS - LIMPAR FANTASMAS
// ============================================
// Remove posições do DB que não existem na Binance

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

    console.log(`🧹 FORCE SYNC - User: ${user_id}`);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Buscar todas as posições do DB
    const { data: dbPositions, error: dbError } = await supabaseAdmin
      .from('active_positions')
      .select('*')
      .eq('user_id', user_id);

    if (dbError) throw dbError;

    console.log(`📊 Posições no DB: ${dbPositions?.length || 0}`);

    // 2. Buscar configurações do usuário
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from('user_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      throw new Error('Configurações não encontradas');
    }

    // 3. Se paper mode, apenas limpar tudo
    if (settings.paper_mode) {
      console.log('📝 Paper mode - Limpando todas as posições');
      
      const { error: deleteError } = await supabaseAdmin
        .from('active_positions')
        .delete()
        .eq('user_id', user_id);

      if (deleteError) throw deleteError;

      return new Response(
        JSON.stringify({
          success: true,
          paper_mode: true,
          removed: dbPositions?.length || 0,
          message: 'Todas as posições do paper mode foram removidas'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Modo real - Buscar posições da Binance
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

    console.log(`📊 Posições ativas na Binance: ${activeBinancePositions.length}`);

    // 5. Encontrar e remover posições fantasmas
    const ghostPositions = [];
    const validPositions = [];

    for (const dbPos of dbPositions || []) {
      const existsInBinance = activeBinancePositions.find(
        (bp: any) => bp.symbol === dbPos.asset
      );

      if (!existsInBinance) {
        ghostPositions.push(dbPos);
        
        // Remover do DB
        const { error: deleteError } = await supabaseAdmin
          .from('active_positions')
          .delete()
          .eq('id', dbPos.id);

        if (deleteError) {
          console.error(`❌ Erro ao remover ${dbPos.asset}:`, deleteError);
        } else {
          console.log(`🗑️ Removida posição fantasma: ${dbPos.asset}`);
        }
      } else {
        validPositions.push(dbPos);
      }
    }

    console.log(`✅ Limpeza concluída:
      - Posições válidas: ${validPositions.length}
      - Posições fantasmas removidas: ${ghostPositions.length}
    `);

    return new Response(
      JSON.stringify({
        success: true,
        paper_mode: false,
        binance_positions: activeBinancePositions.length,
        db_positions_before: dbPositions?.length || 0,
        valid_positions: validPositions.length,
        removed: ghostPositions.length,
        ghost_positions: ghostPositions.map(p => ({
          asset: p.asset,
          direction: p.direction,
          entry_price: p.entry_price
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro no force sync:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
