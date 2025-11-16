import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BINANCE_API_KEY = Deno.env.get('BINANCE_API_KEY');
const BINANCE_API_SECRET = Deno.env.get('BINANCE_API_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ✅ CRÍTICO: Receber user_id do body
    const { user_id, asset, direction, quantity, price, stopLoss, takeProfit, agents, session, riskReward } = await req.json();

    if (!user_id) {
      throw new Error('user_id is required');
    }

    console.log('\n================================================================================');
    console.log('📋 VALIDAÇÃO DE DIREÇÃO - INÍCIO DA ORDEM');
    console.log('================================================================================');
    console.log(`👤 User ID: ${user_id}`);
    console.log(`🎯 Asset: ${asset}`);
    console.log(`📊 Direction recebida: ${direction}`);
    console.log(`💰 Quantity recebida: ${quantity}`);
    console.log(`💵 Price: ${price}`);
    console.log(`🛑 Stop Loss: ${stopLoss}`);
    console.log(`🎯 Take Profit: ${takeProfit}`);
    console.log(`⚖️ Risk/Reward: ${riskReward}`);
    
    // ✅ VALIDAÇÃO CRÍTICA: Verificar se stop/TP estão corretos para a direção
    let correctedStopLoss = stopLoss;
    let correctedTakeProfit = takeProfit;
    
    if (direction === 'BUY') {
      // Para BUY: Stop DEVE estar ABAIXO da entrada, TP ACIMA
      if (stopLoss > price) {
        console.log('⚠️ INVERSÃO DETECTADA: Stop Loss está ACIMA da entrada para BUY!');
        console.log(`   Invertendo: Stop ${stopLoss} ↔ TP ${takeProfit}`);
        [correctedStopLoss, correctedTakeProfit] = [takeProfit, stopLoss];
      }
    } else if (direction === 'SELL') {
      // Para SELL: Stop DEVE estar ACIMA da entrada, TP ABAIXO
      if (stopLoss < price) {
        console.log('⚠️ INVERSÃO DETECTADA: Stop Loss está ABAIXO da entrada para SELL!');
        console.log(`   Invertendo: Stop ${stopLoss} ↔ TP ${takeProfit}`);
        [correctedStopLoss, correctedTakeProfit] = [takeProfit, stopLoss];
      }
    }
    
    // Atualizar valores corrigidos
    const finalStopLoss = correctedStopLoss;
    const finalTakeProfit = correctedTakeProfit;
    
    // Calcular distâncias
    const stopDistance = Math.abs(price - finalStopLoss);
    const tpDistance = Math.abs(finalTakeProfit - price);
    const calculatedRR = tpDistance / stopDistance;
    
    console.log(`\n✅ VALORES FINAIS:`);
    console.log(`├─ Entry: ${price}`);
    console.log(`├─ Stop: ${finalStopLoss} ${direction === 'BUY' ? '(ABAIXO)' : '(ACIMA)'}`);
    console.log(`├─ TP: ${finalTakeProfit} ${direction === 'BUY' ? '(ACIMA)' : '(ABAIXO)'}`);
    console.log(`├─ 📏 Stop Distance: ${stopDistance.toFixed(4)}`);
    console.log(`├─ 📏 TP Distance: ${tpDistance.toFixed(4)}`);
    console.log(`└─ ⚖️ Risk/Reward Calculado: ${calculatedRR.toFixed(2)}:1`);
    console.log('================================================================================\n');
    
    // Decodificar informações dos agentes se disponível
    if (agents) {
      console.log('\n🤖 ANÁLISE DOS AGENTES:');
      console.log(`├─ Agentes ativos: ${JSON.stringify(agents)}`);
      
      // Tentar extrair informações de sweep e confirmação M1 se estiverem nos metadados
      if (agents.sweep_info) {
        console.log(`├─ 🎯 SWEEP DETECTADO: ${agents.sweep_info.type}`);
        console.log(`├─ 📍 Nível do sweep: $${agents.sweep_info.level}`);
        console.log(`├─ 🔄 Direção indicada pelo sweep: ${agents.sweep_info.suggested_direction}`);
      }
      
      if (agents.m1_confirmation) {
        console.log(`├─ ✅ CONFIRMAÇÃO M1: ${agents.m1_confirmation.status}`);
        console.log(`├─ 📊 Candle fechou: ${agents.m1_confirmation.close_position}`);
        console.log(`├─ 🎯 Trigger: $${agents.m1_confirmation.trigger_price}`);
        console.log(`└─ 🔄 Direção confirmada: ${agents.m1_confirmation.direction}`);
      }
    }
    
    console.log('================================================================================\n');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ✅ CONTROLE: Verificar se já existe posição ativa para este ativo
    const { data: existingPosition, error: positionCheckError } = await supabase
      .from('active_positions')
      .select('*')
      .eq('user_id', user_id)
      .eq('asset', asset)
      .single();

    if (existingPosition) {
      console.log(`⚠️ Posição já existe para ${asset}. Rejeitando ordem duplicada.`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          message: `Já existe uma posição ativa para ${asset}`,
          duplicate: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ✅ Get settings POR USUÁRIO
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to fetch user settings');
    }

    // Check if paper trading mode
    if (settings.paper_mode) {
      console.log('PAPER MODE: Simulating order');
      
      // ✅ Save to active_positions COM user_id
      const { error: insertError } = await supabase
        .from('active_positions')
        .insert({
          user_id,
          asset,
          direction,
          entry_price: price,
          current_price: price,
          stop_loss: finalStopLoss,          // ✅ Usar valor corrigido
          take_profit: finalTakeProfit,       // ✅ Usar valor corrigido
          risk_reward: riskReward,
          current_pnl: 0,
          projected_profit: (direction === 'BUY' || direction === 'LONG')
            ? (finalTakeProfit - price) * quantity
            : (price - finalTakeProfit) * quantity,
          agents,
          session,
        });

      if (insertError) {
        console.error('Error inserting position:', insertError);
        throw insertError;
      }

      // ✅ Save to operations COM user_id
      const { error: opError } = await supabase
        .from('operations')
        .insert({
          user_id,
          asset,
          direction,
          entry_price: price,
          stop_loss: finalStopLoss,          // ✅ Usar valor corrigido
          take_profit: finalTakeProfit,       // ✅ Usar valor corrigido
          risk_reward: riskReward,
          result: 'OPEN',
          agents,
          session,
        });

      if (opError) {
        console.error('Error inserting operation:', opError);
      }

      // ✅ INCREMENTAR CONTADOR DA SESSÃO APÓS SUCESSO
      if (session) {
        console.log(`📊 Incrementando contador da sessão ${session}...`);
        const today = new Date().toISOString().split('T')[0];
        
        const { data: existingCount, error: fetchError } = await supabase
          .from('session_trade_count')
          .select('*')
          .eq('user_id', user_id)
          .eq('session', session)
          .eq('date', today)
          .maybeSingle();

        if (fetchError) {
          console.error('Erro ao buscar contador:', fetchError);
        } else if (existingCount) {
          await supabase
            .from('session_trade_count')
            .update({ trade_count: (existingCount.trade_count || 0) + 1 })
            .eq('id', existingCount.id);
          console.log(`✅ Contador atualizado: ${(existingCount.trade_count || 0) + 1}/1`);
        } else {
          await supabase
            .from('session_trade_count')
            .insert({
              user_id,
              session,
              date: today,
              trade_count: 1
            });
          console.log(`✅ Contador criado: 1/1`);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          mode: 'paper',
          message: 'Paper trade executed successfully',
          data: { asset, direction, price }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // REAL MODE: Execute on Binance
    console.log('🔴 REAL MODE ACTIVATED - Executing real order on Binance');
    
    // ✅ CRÍTICO: Usar credenciais do USUÁRIO, não globais
    const userApiKey = settings.api_key;
    const userApiSecret = settings.api_secret;
    
    if (!userApiKey || !userApiSecret) {
      console.error('❌ User Binance credentials not configured');
      throw new Error('Por favor, configure suas credenciais da Binance nas configurações do bot para operar em modo real');
    }

    console.log(`Using user API key: ${userApiKey.substring(0, 8)}...`);

    // 🔧 Configure leverage for the pair
    const leverage = settings.leverage || 20;
    console.log(`🔧 Configurando alavancagem ${leverage}x na Binance`);
    
    try {
      const leverageTimestamp = Date.now();
      const leverageParams = new URLSearchParams({
        symbol: asset,
        leverage: leverage.toString(),
        timestamp: leverageTimestamp.toString(),
      });

      // Sign leverage request
      const leverageEncoder = new TextEncoder();
      const leverageKey = await crypto.subtle.importKey(
        'raw',
        leverageEncoder.encode(userApiSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const leverageSignature = await crypto.subtle.sign(
        'HMAC',
        leverageKey,
        leverageEncoder.encode(leverageParams.toString())
      );
      const leverageSignatureHex = Array.from(new Uint8Array(leverageSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      leverageParams.append('signature', leverageSignatureHex);

      const leverageResponse = await fetch(
        `https://fapi.binance.com/fapi/v1/leverage?${leverageParams}`,
        {
          method: 'POST',
          headers: { 'X-MBX-APIKEY': userApiKey },
        }
      );

      if (!leverageResponse.ok) {
        const leverageError = await leverageResponse.text();
        console.error(`⚠️ Falha ao configurar alavancagem:`, leverageError);
        // Continue anyway - leverage might already be set
      } else {
        const leverageResult = await leverageResponse.json();
        console.log(`✅ Alavancagem ${leverageResult.leverage}x configurada para ${asset}`);
      }
    } catch (leverageError) {
      console.error(`⚠️ Erro ao configurar alavancagem:`, leverageError);
      // Continue anyway - leverage configuration is not critical for order execution
    }

    // Map direction to Binance side (LONG/BUY -> BUY, SHORT/SELL -> SELL)
    const side = (direction === 'LONG' || direction === 'BUY') ? 'BUY' 
               : (direction === 'SHORT' || direction === 'SELL') ? 'SELL' 
               : direction;
    
    console.log('\n🔄 MAPEAMENTO DE DIREÇÃO:');
    console.log(`├─ Direction do sistema: ${direction}`);
    console.log(`├─ Side para Binance: ${side}`);
    console.log(`└─ Lógica: ${direction === 'LONG' ? 'LONG → BUY' : direction === 'SHORT' ? 'SHORT → SELL' : 'Direto'}`);
    
    // ✅ VALIDAÇÃO CRÍTICA: Garantir quantity mínima para atender notional da Binance
    const MIN_NOTIONAL = 100; // $100 USD mínimo
    let calculatedQuantity = quantity;
    let notionalValue = calculatedQuantity * price;
    
    console.log('\n💰 VALIDAÇÃO DE QUANTITY MÍNIMA:');
    console.log(`├─ Quantity recebida: ${quantity}`);
    console.log(`├─ Price: $${price}`);
    console.log(`├─ Notional calculado: $${notionalValue.toFixed(2)}`);
    console.log(`└─ Mínimo requerido: $${MIN_NOTIONAL}`);
    
    // Se notional for menor que o mínimo, ajustar quantity
    if (notionalValue < MIN_NOTIONAL) {
      calculatedQuantity = MIN_NOTIONAL / price;
      notionalValue = calculatedQuantity * price;
      console.log(`⚠️ AJUSTE NECESSÁRIO:`);
      console.log(`├─ Nova quantity: ${calculatedQuantity}`);
      console.log(`└─ Novo notional: $${notionalValue.toFixed(2)}`);
    } else {
      console.log(`✅ Notional OK - Nenhum ajuste necessário`);
    }
    
    // ✅ CRÍTICO: Formatar quantidade com precisão EXATA da Binance
    // Regras de precisão:
    // - Pares com "1000" (1000PEPE, 1000FLOKI, etc): 0 decimais (inteiros)
    // - Pares padrão (BTC, ETH, etc): 3 decimais
    // - Altcoins (DOGE, SHIB, etc): 0 decimais (inteiros)
    let formattedQuantity: number;
    
    if (asset.includes('1000') || asset.includes('DOGE') || asset.includes('SHIB') || 
        asset.includes('PEPE') || asset.includes('FLOKI') || asset.includes('BONK')) {
      // Quantidade inteira (sem decimais)
      formattedQuantity = Math.floor(calculatedQuantity);
    } else if (asset.includes('BTC') || asset.includes('ETH')) {
      // Alta precisão: 3 decimais
      formattedQuantity = parseFloat(calculatedQuantity.toFixed(3));
    } else {
      // Padrão: 0 decimais (inteiros) para maioria das altcoins
      formattedQuantity = Math.floor(calculatedQuantity);
    }
    
    console.log('\n================================================================================');
    console.log('📡 ORDEM FINAL ENVIADA À BINANCE');
    console.log('================================================================================');
    console.log(`🎯 Symbol: ${asset}`);
    console.log(`📊 Side: ${side} (${direction})`);
    console.log(`💰 Quantity original: ${quantity}`);
    console.log(`💰 Quantity calculada: ${calculatedQuantity}`);
    console.log(`💰 Quantity formatada: ${formattedQuantity}`);
    console.log(`💵 Notional final: $${(formattedQuantity * price).toFixed(2)}`);
    console.log(`💵 Type: MARKET`);
    console.log(`📍 Stop Loss: $${finalStopLoss}`);
    console.log(`🎯 Take Profit: $${finalTakeProfit}`);
    console.log(`⚖️ Risk/Reward: ${riskReward}`);
    console.log('================================================================================\n');

    const timestamp = Date.now();
    const params = new URLSearchParams({
      symbol: asset,
      side: side,
      type: 'MARKET',
      quantity: formattedQuantity.toString(),
      timestamp: timestamp.toString(),
    });

    // Create HMAC signature with user's secret key
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(userApiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(params.toString())
    );
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    params.append('signature', signatureHex);

    // Send order to Binance with user's API key
    const response = await fetch(`https://fapi.binance.com/fapi/v1/order?${params}`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': userApiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Binance API error:', response.status, errorText);
      
      // Parse error for better user feedback
      let errorMessage = 'Erro ao executar ordem na Binance';
      try {
        const errorData = JSON.parse(errorText);
        errorMessage = errorData.msg || errorMessage;
        
        // Specific error handling
        if (errorMessage.includes('API-key')) {
          errorMessage = 'Credenciais da Binance inválidas. Verifique suas API keys nas configurações.';
        } else if (errorMessage.includes('Signature')) {
          errorMessage = 'Erro de autenticação. Verifique se suas credenciais estão corretas.';
        } else if (errorMessage.includes('balance')) {
          errorMessage = 'Saldo insuficiente na Binance para executar esta ordem.';
        }
      } catch (e) {
        // Keep generic error message
      }
      
      throw new Error(errorMessage);
    }

    const binanceResult = await response.json();
    console.log('✅ Order executed successfully on Binance:', binanceResult);

    // ✅ VALIDAR STATUS DA ORDEM (CRÍTICO!)
    const acceptedStatuses = ['NEW', 'FILLED', 'PARTIALLY_FILLED'];
    if (!binanceResult.orderId || !acceptedStatuses.includes(binanceResult.status)) {
      const rejectionReason = binanceResult.status === 'REJECTED' 
        ? `Ordem rejeitada pela Binance: ${binanceResult.msg || 'Motivo desconhecido'}` 
        : `Status inválido: ${binanceResult.status}`;
      
      console.error(`❌ ${rejectionReason}:`, binanceResult);
      throw new Error(rejectionReason);
    }

    console.log(`✅ Ordem ${binanceResult.status} - Order ID: ${binanceResult.orderId}`);

    // ✅ BUSCAR DADOS REAIS DA POSIÇÃO NA BINANCE
    let entryPriceReal = price;
    let currentPriceReal = price;
    let pnlReal = 0;

    try {
      console.log('🔍 Buscando posição real na Binance...');
      
      const positionTimestamp = Date.now();
      const positionParams = new URLSearchParams({
        symbol: asset,
        timestamp: positionTimestamp.toString(),
      });

      // Assinar requisição
      const positionEncoder = new TextEncoder();
      const positionKey = await crypto.subtle.importKey(
        'raw',
        positionEncoder.encode(userApiSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const positionSignature = await crypto.subtle.sign(
        'HMAC',
        positionKey,
        positionEncoder.encode(positionParams.toString())
      );
      const positionSignatureHex = Array.from(new Uint8Array(positionSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      positionParams.append('signature', positionSignatureHex);

      // Buscar posição real na Binance
      const positionResponse = await fetch(
        `https://fapi.binance.com/fapi/v2/positionRisk?${positionParams}`,
        { headers: { 'X-MBX-APIKEY': userApiKey } }
      );

      if (positionResponse.ok) {
        const allPositions = await positionResponse.json();
        const realPosition = allPositions.find((p: any) => 
          p.symbol === asset && parseFloat(p.positionAmt) !== 0
        );

        if (realPosition) {
          entryPriceReal = parseFloat(realPosition.entryPrice);
          currentPriceReal = parseFloat(realPosition.markPrice);
          pnlReal = parseFloat(realPosition.unRealizedProfit);

          console.log(`✅ Dados reais da Binance:
├─ Entry: $${entryPriceReal}
├─ Current: $${currentPriceReal}
└─ P&L: $${pnlReal}`);
        } else {
          console.log('⚠️ Posição não encontrada na Binance, usando dados calculados');
        }
      } else {
        console.error('❌ Falha ao buscar posição real da Binance');
      }
    } catch (posError) {
      console.error('⚠️ Erro ao buscar posição real:', posError);
      // Continuar com dados calculados como fallback
    }

    // ✅ Save to database COM DADOS REAIS DA BINANCE
    const { error: insertError } = await supabase
      .from('active_positions')
      .insert({
        user_id,
        asset,
        direction,
        entry_price: entryPriceReal,      // ✅ Preço REAL da Binance
        current_price: currentPriceReal,   // ✅ Preço REAL atual
        stop_loss: finalStopLoss,          // ✅ Usar valor corrigido
        take_profit: finalTakeProfit,       // ✅ Usar valor corrigido
        risk_reward: riskReward,
        current_pnl: pnlReal,              // ✅ P&L REAL da Binance
        projected_profit: (direction === 'BUY' || direction === 'LONG')
          ? (finalTakeProfit - entryPriceReal) * quantity
          : (entryPriceReal - finalTakeProfit) * quantity,
        agents,
        session,
      });

    if (insertError) {
      console.error('❌ ERRO CRÍTICO ao inserir em active_positions:', insertError);
      console.error('❌ Dados da ordem:', {
        user_id,
        asset,
        direction,
        entry_price: entryPriceReal,
        stop_loss: stopLoss,
        take_profit: takeProfit,
      });
      
      // ✅ CRÍTICO: Não abortar execução, mas registrar erro grave
      // A ordem foi executada na Binance, precisamos garantir registro
    } else {
      console.log(`✅ Posição inserida em active_positions: ${asset} ${direction}`);
    }

    // ✅ Insert operation COM user_id e strategy - SÓ APÓS VALIDAÇÃO
    const { error: opError } = await supabase
      .from('operations')
      .insert({
        user_id,
        asset,
        direction,
        entry_price: entryPriceReal,  // ✅ CORRIGIDO: Usar preço REAL da Binance (igual active_positions)
        stop_loss: finalStopLoss,          // ✅ Usar valor corrigido
        take_profit: finalTakeProfit,       // ✅ Usar valor corrigido
        risk_reward: riskReward,
        result: 'OPEN',
        strategy: agents?.strategy || 'UNKNOWN',
        agents,
        session,
      });

    if (opError) {
      console.error('❌ ERRO CRÍTICO ao inserir operation:', opError);
      // ⚠️ Ordem FOI executada na Binance, mas falhou ao registrar
      // NÃO reverter ordem, apenas logar erro grave
    }

    // ✅ INCREMENTAR CONTADOR APENAS SE INSERÇÃO EM OPERATIONS FOI BEM-SUCEDIDA
    if (!opError && session) {
      console.log(`📊 Incrementando contador da sessão ${session}...`);
      const today = new Date().toISOString().split('T')[0];
      
      const { data: existingCount, error: fetchError } = await supabase
        .from('session_trade_count')
        .select('*')
        .eq('user_id', user_id)
        .eq('session', session)
        .eq('date', today)
        .maybeSingle();

      if (fetchError) {
        console.error('Erro ao buscar contador:', fetchError);
      } else if (existingCount) {
        await supabase
          .from('session_trade_count')
          .update({ trade_count: (existingCount.trade_count || 0) + 1 })
          .eq('id', existingCount.id);
        console.log(`✅ Contador atualizado: ${(existingCount.trade_count || 0) + 1}/1`);
      } else {
        await supabase
          .from('session_trade_count')
          .insert({
            user_id,
            session,
            date: today,
            trade_count: 1
          });
        console.log(`✅ Contador criado: 1/1`);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        mode: 'real',
        message: 'Ordem executada com sucesso na Binance',
        binanceOrder: binanceResult,
        data: {
          asset,
          direction,
          price,
          orderId: binanceResult.orderId,
          status: binanceResult.status
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in binance-order:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
