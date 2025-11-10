import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🔄 Iniciando sincronização para user: ${user_id}`);

    // 1. Buscar configurações do usuário (API keys da Binance)
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('api_key, api_secret, leverage')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings?.api_key || !settings?.api_secret) {
      throw new Error('API keys da Binance não configuradas');
    }

    // 2. Buscar posições abertas na Binance
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    // Criar assinatura HMAC SHA256
    const encoder = new TextEncoder();
    const keyData = encoder.encode(settings.api_secret);
    const messageData = encoder.encode(queryString);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const binanceUrl = `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
    const response = await fetch(binanceUrl, {
      headers: {
        'X-MBX-APIKEY': settings.api_key,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Binance API error (${response.status}): ${errorText}`);
    }

    const allPositions = await response.json();
    
    // Validar resposta da Binance
    if (!allPositions || !Array.isArray(allPositions)) {
      console.log('⚠️ Resposta da Binance inválida ou vazia');
      return new Response(
        JSON.stringify({ synced: true, positions_count: 0, added: 0, updated: 0, removed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 3. Filtrar apenas posições abertas (positionAmt != "0")
    const openPositions = allPositions.filter((pos: any) => parseFloat(pos.positionAmt) !== 0);

    console.log(`📊 Encontradas ${openPositions.length} posições abertas na Binance`);
    
    if (openPositions.length > 0) {
      console.log(`Posições abertas:`);
      openPositions.forEach((pos: any) => {
        const direction = parseFloat(pos.positionAmt) > 0 ? 'LONG' : 'SHORT';
        const pnl = parseFloat(pos.unRealizedProfit);
        console.log(`├─ ${pos.symbol}: ${direction} | P&L: $${pnl.toFixed(2)}`);
      });
    }

    // 4. Buscar posições do banco de dados
    const { data: dbPositions } = await supabase
      .from('active_positions')
      .select('*')
      .eq('user_id', user_id);

    let added = 0;
    let updated = 0;
    let removed = 0;

    // 5. Adicionar/Atualizar posições da Binance no banco
    for (const binancePos of openPositions) {
      const symbol = binancePos.symbol;
      const positionAmt = parseFloat(binancePos.positionAmt);
      const entryPrice = parseFloat(binancePos.entryPrice);
      const markPrice = parseFloat(binancePos.markPrice);
      const unrealizedPnl = parseFloat(binancePos.unRealizedProfit);
      const leverage = parseFloat(binancePos.leverage);
      const direction = positionAmt > 0 ? 'BUY' : 'SELL';

      // Verificar se posição já existe no banco
      const existingPos = dbPositions?.find(p => p.asset === symbol);

      if (existingPos) {
        // ✅ Atualizar preço e P&L
        const { error: updateError } = await supabase
          .from('active_positions')
          .update({
            current_price: markPrice,
            current_pnl: unrealizedPnl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingPos.id);
        
        if (!updateError) {
          updated++;
          console.log(`🔄 Atualizado: ${symbol} - P&L: $${unrealizedPnl.toFixed(2)}`);
        }
      } else {
        // ✅ Adicionar nova posição ao banco (estimando SL/TP)
        const stopLoss = direction === 'BUY' 
          ? entryPrice * 0.995  // -0.5% para LONG
          : entryPrice * 1.005; // +0.5% para SHORT
        
        const takeProfit = direction === 'BUY'
          ? entryPrice * 1.015  // +1.5% para LONG
          : entryPrice * 0.985; // -1.5% para SHORT

        const riskReward = Math.abs((takeProfit - entryPrice) / (stopLoss - entryPrice));
        const projectedProfit = Math.abs(takeProfit - entryPrice) * Math.abs(positionAmt);

        const { error: insertError } = await supabase
          .from('active_positions')
          .insert({
            user_id: user_id,
            asset: symbol,
            direction: direction,
            entry_price: entryPrice,
            current_price: markPrice,
            stop_loss: stopLoss,
            take_profit: takeProfit,
            current_pnl: unrealizedPnl,
            risk_reward: riskReward,
            projected_profit: projectedProfit,
            opened_at: new Date().toISOString(),
            session: 'Manual', // Marcado como aberto manualmente
            agents: {
              note: 'Posição sincronizada da Binance (SL/TP estimados)',
              synced_at: new Date().toISOString(),
            }
          });
        
        if (!insertError) {
          added++;
          console.log(`📥 Adicionado: ${symbol} ${direction} - Entry: $${entryPrice}`);
        }
      }
    }

    // 6. Remover posições do banco que não existem mais na Binance
    if (dbPositions) {
      for (const dbPos of dbPositions) {
        const stillOpen = openPositions.find((bp: any) => bp.symbol === dbPos.asset);
        if (!stillOpen) {
          const { error: deleteError } = await supabase
            .from('active_positions')
            .delete()
            .eq('id', dbPos.id);
          
          if (!deleteError) {
            removed++;
            console.log(`🗑️ Removido: ${dbPos.asset} (fechado na Binance)`);
          }
        }
      }
    }

    console.log(`✅ Sincronização completa: ${openPositions.length} posições ativas`);
    console.log(`├─ Adicionadas: ${added}`);
    console.log(`├─ Atualizadas: ${updated}`);
    console.log(`└─ Removidas: ${removed}`);

    return new Response(
      JSON.stringify({
        synced: true,
        positions_count: openPositions.length,
        added,
        updated,
        removed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro na sincronização:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
