import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper para aguardar
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Consultar status da ordem
async function checkOrderStatus(orderId: number, symbol: string, apiKey: string, apiSecret: string) {
  const timestamp = Date.now();
  const queryString = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const signature = createHmac('sha256', apiSecret)
    .update(queryString)
    .digest('hex');
  
  const url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;
  const response = await fetch(url, {
    headers: { 'X-MBX-APIKEY': apiKey },
  });
  
  return await response.json();
}

// Aguardar execução da ordem
async function waitForOrderExecution(orderId: number, symbol: string, apiKey: string, apiSecret: string, maxAttempts = 5) {
  console.log(`⏳ Aguardando execução da ordem ${orderId}...`);
  
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(2000); // Aguardar 2 segundos
    
    const orderStatus = await checkOrderStatus(orderId, symbol, apiKey, apiSecret);
    console.log(`🔍 Tentativa ${i + 1}/${maxAttempts} - Status: ${orderStatus.status}, Executed: ${orderStatus.executedQty}`);
    
    if (orderStatus.status === 'FILLED' && parseFloat(orderStatus.executedQty) > 0) {
      console.log(`✅ Ordem executada com sucesso! avgPrice: ${orderStatus.avgPrice}`);
      return orderStatus;
    }
  }
  
  throw new Error(`Ordem ${orderId} não foi executada após ${maxAttempts * 2} segundos`);
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, position_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🔍 Buscando posição ativa para user ${user_id}...`);

    // Buscar posição ativa (de active_positions OU operations)
    let activePosition = null;
    
    // Tentar active_positions primeiro
    const { data: fromActivePositions } = await supabase
      .from('active_positions')
      .select('*')
      .eq('user_id', user_id)
      .limit(1)
      .single();

    if (fromActivePositions) {
      activePosition = fromActivePositions;
      console.log(`✅ Posição encontrada em active_positions: ${activePosition.asset}`);
    } else {
      // Fallback: buscar em operations com result = 'OPEN'
      const { data: fromOperations } = await supabase
        .from('operations')
        .select('*')
        .eq('user_id', user_id)
        .eq('result', 'OPEN')
        .order('entry_time', { ascending: false })
        .limit(1)
        .single();

      if (fromOperations) {
        activePosition = fromOperations;
        console.log(`✅ Posição encontrada em operations: ${activePosition.asset}`);
      }
    }

    // Se não encontrou no banco, buscar diretamente na Binance
    if (!activePosition) {
      console.log('⚠️ Nenhuma posição no banco - buscando diretamente na Binance...');
      
      // Get user settings (API keys)
      const { data: settings } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (!settings || !settings.api_key || !settings.api_secret) {
        return new Response(
          JSON.stringify({ error: 'Binance API credentials not configured' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const apiKey = settings.api_key;
      const apiSecret = settings.api_secret;

      // Buscar posições abertas na Binance
      const positionTimestamp = Date.now();
      const positionParams = `timestamp=${positionTimestamp}`;
      const positionSignature = createHmac('sha256', apiSecret)
        .update(positionParams)
        .digest('hex');

      const positionUrl = `https://fapi.binance.com/fapi/v2/positionRisk?${positionParams}&signature=${positionSignature}`;
      const positionResponse = await fetch(positionUrl, {
        headers: { 'X-MBX-APIKEY': apiKey },
      });

      if (!positionResponse.ok) {
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Erro ao consultar Binance',
            message: 'Não foi possível consultar posições na Binance'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const allPositions = await positionResponse.json();
      const openPositions = allPositions.filter((p: any) => parseFloat(p.positionAmt) !== 0);

      if (openPositions.length === 0) {
        console.log('⚠️ Nenhuma posição aberta encontrada na Binance');
        return new Response(
          JSON.stringify({ 
            success: false,
            error: 'Nenhuma posição ativa encontrada',
            message: 'Não há posições abertas para fechar'
          }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Pegar a primeira posição aberta
      const binancePosition = openPositions[0];
      const positionAmt = parseFloat(binancePosition.positionAmt);
      
      activePosition = {
        asset: binancePosition.symbol,
        direction: positionAmt > 0 ? 'LONG' : 'SHORT',
        entry_price: parseFloat(binancePosition.entryPrice),
        quantity: Math.abs(positionAmt),
        user_id: user_id
      };

      console.log(`✅ Posição encontrada na Binance: ${activePosition.asset} ${activePosition.direction} ${activePosition.quantity}`);
    }

    const asset = activePosition.asset;
    const direction = activePosition.direction;
    
    // Inverter direção para fechar: SHORT -> BUY, LONG/BUY -> SELL
    const closeSide = (direction === 'SHORT' || direction === 'SELL') ? 'BUY' : 'SELL';
    
    console.log(`📊 Posição ativa:
├─ Asset: ${asset}
├─ Direction: ${direction}
├─ Close Side: ${closeSide}
└─ Entry Price: $${activePosition.entry_price}`);


    // Get user settings (API keys)
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (!settings || !settings.api_key || !settings.api_secret) {
      return new Response(
        JSON.stringify({ error: 'Binance API credentials not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = settings.api_key;
    const apiSecret = settings.api_secret;
    const paperMode = settings.paper_mode;

    // If paper mode, simulate and clean database
    if (paperMode) {
      console.log(`📋 Paper mode: simulando fechamento de ${asset}`);
      
      // Limpar active_positions
      await supabase
        .from('active_positions')
        .delete()
        .eq('user_id', user_id)
        .eq('asset', asset);

      // Atualizar operations
      await supabase
        .from('operations')
        .update({ 
          result: 'LOSS',
          exit_time: new Date().toISOString(),
          exit_price: activePosition.entry_price,
          pnl: 0
        })
        .eq('user_id', user_id)
        .eq('asset', asset)
        .eq('result', 'OPEN');

      console.log(`✅ Posição paper simulada fechada: ${asset}`);
      
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'paper',
          message: 'Posição fechada (paper mode)',
          asset,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================
    // FECHAR POSIÇÃO REAL NA BINANCE
    // ============================================
    console.log(`🔥 REAL MODE: Fechando posição na Binance para ${asset}`);

    // Primeiro, buscar quantidade REAL da posição na Binance
    const positionTimestamp = Date.now();
    const positionParams = `symbol=${asset}&timestamp=${positionTimestamp}`;
    const positionSignature = createHmac('sha256', apiSecret)
      .update(positionParams)
      .digest('hex');

    const positionUrl = `https://fapi.binance.com/fapi/v2/positionRisk?${positionParams}&signature=${positionSignature}`;
    const positionResponse = await fetch(positionUrl, {
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    let realQuantity = 0;
    
    if (positionResponse.ok) {
      const allPositions = await positionResponse.json();
      const position = allPositions.find((p: any) => 
        p.symbol === asset && parseFloat(p.positionAmt) !== 0
      );

      if (position) {
        realQuantity = Math.abs(parseFloat(position.positionAmt));
        console.log(`✅ Quantidade real na Binance: ${realQuantity} ${asset}`);
      } else {
        console.log(`⚠️ Posição não encontrada na Binance - provavelmente já fechada`);
        
        // Limpar banco de dados mesmo assim
        await supabase.from('active_positions').delete().eq('user_id', user_id).eq('asset', asset);
        await supabase.from('operations').update({ 
          result: 'LOSS', 
          exit_time: new Date().toISOString() 
        }).eq('user_id', user_id).eq('asset', asset).eq('result', 'OPEN');

        return new Response(
          JSON.stringify({
            success: true,
            mode: 'real',
            message: 'Posição não encontrada na Binance, registros limpos',
            asset,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Se não conseguiu buscar quantidade, usar reduceOnly
    if (realQuantity === 0) {
      console.log('⚠️ Não foi possível buscar quantidade real, fechando com REDUCE_ONLY');
    }

    const timestamp = Date.now();
    let queryString = `symbol=${asset}&side=${closeSide}&type=MARKET&timestamp=${timestamp}`;
    
    // Se temos quantidade real, usar ela; senão usar reduceOnly
    if (realQuantity > 0) {
      queryString += `&quantity=${realQuantity}`;
    } else {
      queryString += `&reduceOnly=true`;
    }
    
    const signature = createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

    console.log(`📤 Enviando ordem de fechamento para Binance: ${closeSide} ${asset}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'X-MBX-APIKEY': apiKey },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Binance API error:', data);
      
      // Se erro -2022 (ReduceOnly Order is rejected), posição já está fechada
      if (data.code === -2022) {
        console.log('⚠️ Posição já fechada na Binance - limpando registros');
        
        await supabase.from('active_positions').delete().eq('user_id', user_id).eq('asset', asset);
        await supabase.from('operations').update({ 
          result: 'LOSS', 
          exit_time: new Date().toISOString() 
        }).eq('user_id', user_id).eq('asset', asset).eq('result', 'OPEN');

        return new Response(
          JSON.stringify({
            success: true,
            mode: 'real',
            message: 'Posição já estava fechada na Binance, registros limpos',
            asset,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: 'Binance API error', 
          details: data,
          code: data.code,
          msg: data.msg
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Ordem enviada para Binance:`, data);
    console.log(`📋 OrderId: ${data.orderId}, Status: ${data.status}`);

    // ============================================
    // AGUARDAR EXECUÇÃO DA ORDEM
    // ============================================
    let finalOrderData = data;
    
    // Se a ordem não foi executada instantaneamente, aguardar
    if (data.status !== 'FILLED' || parseFloat(data.avgPrice || '0') === 0) {
      try {
        finalOrderData = await waitForOrderExecution(data.orderId, asset, apiKey, apiSecret);
      } catch (error) {
        console.error('⚠️ Timeout ao aguardar execução da ordem:', error);
        // Continuar mesmo assim e usar o último preço conhecido
        console.log('⚠️ Usando entry_price como fallback para exit_price');
      }
    }

    const exitPrice = parseFloat(finalOrderData.avgPrice || activePosition.entry_price);
    console.log(`💰 Exit Price Final: $${exitPrice}`);

    // ============================================
    // LIMPAR REGISTROS NO BANCO DE DADOS
    // ============================================
    console.log(`🧹 Limpando registros no banco de dados...`);

    // 1. Remover de active_positions
    const { error: deleteError } = await supabase
      .from('active_positions')
      .delete()
      .eq('user_id', user_id)
      .eq('asset', asset);

    if (deleteError) {
      console.error('⚠️ Erro ao deletar de active_positions:', deleteError);
    } else {
      console.log(`✅ Removido de active_positions`);
    }

    // 2. Calcular P&L com o exit_price real
    const entryPrice = parseFloat(activePosition.entry_price);
    const pnl = direction === 'SHORT' || direction === 'SELL'
      ? (entryPrice - exitPrice) * realQuantity
      : (exitPrice - entryPrice) * realQuantity;
    
    console.log(`📊 Cálculo P&L:
├─ Entry: $${entryPrice}
├─ Exit: $${exitPrice}
├─ Quantidade: ${realQuantity}
├─ Direction: ${direction}
└─ P&L: $${pnl.toFixed(2)} (${pnl > 0 ? 'WIN ✅' : 'LOSS ❌'})`);

    // 3. Atualizar operations
    const { error: updateError } = await supabase
      .from('operations')
      .update({ 
        result: pnl > 0 ? 'WIN' : 'LOSS',
        exit_time: new Date().toISOString(),
        exit_price: exitPrice,
        pnl: pnl
      })
      .eq('user_id', user_id)
      .eq('asset', asset)
      .eq('result', 'OPEN');

    if (updateError) {
      console.error('⚠️ Erro ao atualizar operations:', updateError);
    } else {
      console.log(`✅ Operations atualizada: ${pnl > 0 ? 'WIN' : 'LOSS'} | P&L: $${pnl.toFixed(2)}`);
    }

    // ✅ 4. ATUALIZAR DAILY_GOALS
    const today = new Date().toISOString().split('T')[0];
    const { data: dailyGoal } = await supabase
      .from('daily_goals')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', today)
      .maybeSingle();

    if (dailyGoal) {
      const newWins = pnl > 0 ? (dailyGoal.wins || 0) + 1 : dailyGoal.wins || 0;
      const newLosses = pnl <= 0 ? (dailyGoal.losses || 0) + 1 : dailyGoal.losses || 0;
      const newTotalOps = (dailyGoal.total_operations || 0) + 1;
      const newTotalPnl = (dailyGoal.total_pnl || 0) + pnl;
      
      await supabase
        .from('daily_goals')
        .update({
          total_operations: newTotalOps,
          wins: newWins,
          losses: newLosses,
          total_pnl: newTotalPnl,
          completed: newLosses >= (dailyGoal.max_losses || 15) || newTotalOps >= (dailyGoal.target_operations || 45)
        })
        .eq('id', dailyGoal.id);
        
      console.log(`✅ daily_goals atualizado: ${newWins}W/${newLosses}L | Total: ${newTotalOps} ops | PnL: $${newTotalPnl.toFixed(2)}`);
    } else {
      // ✅ CORRIGIDO: Usar UPSERT ao invés de INSERT para evitar duplicate key error
      await supabase
        .from('daily_goals')
        .upsert({
          user_id,
          date: today,
          total_operations: 1,
          wins: pnl > 0 ? 1 : 0,
          losses: pnl <= 0 ? 1 : 0,
          total_pnl: pnl,
          target_operations: 45,
          max_losses: 15,
          completed: false
        }, {
          onConflict: 'date,user_id',
          ignoreDuplicates: false
        });
        
      console.log(`✅ daily_goals criado/atualizado para hoje`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'real',
        binance_response: finalOrderData,
        asset,
        side: closeSide,
        quantity: realQuantity,
        entry_price: entryPrice,
        exit_price: exitPrice,
        pnl: pnl.toFixed(2),
        result: pnl > 0 ? 'WIN' : 'LOSS',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Error in binance-close-order:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
