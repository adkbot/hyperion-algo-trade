import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ⚠️ NÃO USAR KEYS GLOBAIS - Cada usuário tem suas próprias credenciais no DB
// const BINANCE_API_KEY = Deno.env.get('BINANCE_API_KEY');
// const BINANCE_API_SECRET = Deno.env.get('BINANCE_API_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('\n🚀 ========================================');
    console.log('🚀 BINANCE-ORDER INICIADO');
    console.log('🚀 ========================================');
    
    // ✅ CRÍTICO: Receber user_id do body
    const body = await req.json();
    console.log('📥 BODY RECEBIDO:', JSON.stringify(body, null, 2));
    
    const { user_id, asset, direction, quantity, price, stopLoss, takeProfit, agents, session, riskReward } = body;

    if (!user_id) {
      console.error('❌ ERRO CRÍTICO: user_id não fornecido!');
      throw new Error('user_id is required');
    }
    
    console.log('✅ user_id validado:', user_id);

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
    } else if (direction === 'SELL' || direction === 'SHORT') {
      // Para SELL: Stop DEVE estar ACIMA da entrada, TP ABAIXO
      if (stopLoss < price) {
        console.log('⚠️ INVERSÃO DETECTADA: Stop Loss está ABAIXO da entrada para SELL!');
        console.log(`   Invertendo: Stop ${stopLoss} ↔ TP ${takeProfit}`);
        [correctedStopLoss, correctedTakeProfit] = [takeProfit, stopLoss];
      }
    }
    
    // Atualizar valores corrigidos
    // 🔧 Função para arredondar preço conforme tick size
    function roundPrice(price: number, tickSize: number): number {
      return Math.round(price / tickSize) * tickSize;
    }
    
    // Tick sizes conhecidos (BTCUSDT = 0.1, ETHUSDT = 0.01)
    const tickSizes: { [key: string]: number } = {
      'BTCUSDT': 0.1,
      'ETHUSDT': 0.01,
      'BNBUSDT': 0.01,
      'SOLUSDT': 0.001,
      'ADAUSDT': 0.0001,
      'DOTUSDT': 0.001,
      'MATICUSDT': 0.0001,
      'AVAXUSDT': 0.001
    };
    
    const tickSize = tickSizes[asset] || 0.01; // Default 0.01
    
    let finalStopLoss = roundPrice(correctedStopLoss, tickSize);
    let finalTakeProfit = roundPrice(correctedTakeProfit, tickSize);
    
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
    
    // 📝 LOG INICIAL - Registrar início do processamento
    await supabase.from('agent_logs').insert({
      user_id,
      agent_name: 'BINANCE_ORDER',
      asset,
      status: 'processing',
      data: { 
        direction, 
        entry_price: price, 
        stop_loss: finalStopLoss, 
        take_profit: finalTakeProfit,
        timestamp: new Date().toISOString()
      }
    });

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
          projected_profit: (() => {
            const stopDistance = Math.abs(price - finalStopLoss);
            const tpDistance = Math.abs(finalTakeProfit - price);
            const riskAmount = stopDistance * quantity * price;
            const projectedGain = tpDistance * quantity * price;
            
            console.log(`\n📊 CÁLCULO DE PROJEÇÃO DE LUCRO (PAPER):`);
            console.log(`├─ Quantity: ${quantity} contratos`);
            console.log(`├─ Price: $${price}`);
            console.log(`├─ Stop Distance: $${stopDistance.toFixed(2)}`);
            console.log(`├─ TP Distance: $${tpDistance.toFixed(2)}`);
            console.log(`├─ Risk Amount: $${riskAmount.toFixed(2)}`);
            console.log(`└─ Projected Gain: $${projectedGain.toFixed(2)}`);
            
            return projectedGain;
          })(),
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
      
      // 📝 LOG DE SUCESSO - PAPER MODE
      await supabase.from('agent_logs').insert({
        user_id,
        agent_name: 'BINANCE_ORDER',
        asset,
        status: 'success',
        data: { 
          mode: 'PAPER',
          entry_price: price,
          stop_loss: finalStopLoss,
          take_profit: finalTakeProfit,
          quantity,
          timestamp: new Date().toISOString()
        }
      });
      
      // 🔄 FORÇAR SINCRONIZAÇÃO COM BINANCE
      console.log('🔄 Forçando sincronização com Binance (PAPER)...');
      try {
        await supabase.functions.invoke('sync-binance-positions', {
          body: { user_id }
        });
        console.log('✅ Sincronização concluída');
      } catch (syncError) {
        console.warn('⚠️ Erro na sincronização (não crítico):', syncError);
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

    // 🔥 VALIDAÇÃO DE PREÇO EM TEMPO REAL
    console.log('\n💱 VALIDANDO PREÇO ATUAL DA BINANCE...');
    const currentPriceResponse = await fetch(
      `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${asset}`
    );
    const currentPriceData = await currentPriceResponse.json();
    const currentBinancePrice = parseFloat(currentPriceData.price);
    const priceDifference = Math.abs(((currentBinancePrice - price) / price) * 100);

    console.log(`├─ Preço do sinal: $${price}`);
    console.log(`├─ Preço atual Binance: $${currentBinancePrice}`);
    console.log(`└─ Diferença: ${priceDifference.toFixed(2)}%`);

    // Se a diferença for > 0.5%, RECALCULAR stop/tp
    if (priceDifference > 0.5) {
      console.log('⚠️ Preço mudou significativamente! Recalculando níveis...');
      
      const stopDistance = Math.abs(price - finalStopLoss);
      const newStopLoss = direction === 'BUY' 
        ? currentBinancePrice - stopDistance 
        : currentBinancePrice + stopDistance;
      const newTakeProfit = direction === 'BUY'
        ? currentBinancePrice + (stopDistance * 3.0)
        : currentBinancePrice - (stopDistance * 3.0);
        
      finalStopLoss = roundPrice(newStopLoss, tickSize);
      finalTakeProfit = roundPrice(newTakeProfit, tickSize);
      
      console.log(`✅ Níveis atualizados:
      ├─ Novo Entry: $${currentBinancePrice}
      ├─ Novo Stop: $${finalStopLoss}
      └─ Novo TP: $${finalTakeProfit}`);
    }

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
    
    // ✅ BUSCAR PRECISÃO EXATA DA BINANCE PARA O SÍMBOLO
    console.log('\n🔍 Buscando informações de precisão da Binance...');
    const exchangeInfoResponse = await fetch(
      `https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${asset}`,
      {
        headers: {
          'X-MBX-APIKEY': userApiKey,
        }
      }
    );
    
    if (!exchangeInfoResponse.ok) {
      throw new Error(`❌ Erro ao buscar informações do símbolo: ${exchangeInfoResponse.status}`);
    }
    
    const exchangeInfo = await exchangeInfoResponse.json();
    const symbolInfo = exchangeInfo.symbols[0];
    const quantityPrecision = symbolInfo.quantityPrecision;
    
    console.log(`✅ Precisão encontrada para ${asset}: ${quantityPrecision} decimais`);
    
    // Formatar quantity com a precisão correta
    const formattedQuantity = parseFloat(calculatedQuantity.toFixed(quantityPrecision));
    
    console.log(`\n💰 FORMATAÇÃO DE QUANTITY:`);
    console.log(`├─ Quantity calculada: ${calculatedQuantity}`);
    console.log(`├─ Precisão do símbolo: ${quantityPrecision}`);
    console.log(`└─ Quantity formatada: ${formattedQuantity}`);
    
    // ✅ VALIDAR NOTIONAL FINAL ANTES DE ENVIAR
    const finalNotional = formattedQuantity * currentBinancePrice;
    
    console.log(`\n💵 VALIDAÇÃO DE NOTIONAL FINAL:`);
    console.log(`├─ Quantity formatada: ${formattedQuantity}`);
    console.log(`├─ Preço atual: $${currentBinancePrice}`);
    console.log(`├─ Notional calculado: $${finalNotional.toFixed(2)}`);
    console.log(`└─ Mínimo requerido: $100`);
    
    if (finalNotional < 100) {
      throw new Error(
        `❌ Notional muito baixo: $${finalNotional.toFixed(2)} (mínimo $100). ` +
        `Aumente o capital ou escolha outro ativo.`
      );
    }
    
    console.log('✅ Notional OK - Prosseguindo com a ordem');
    
    if (finalNotional < 100) {
      throw new Error(
        `❌ Notional muito baixo: $${finalNotional.toFixed(2)} (mínimo $100). ` +
        `Aumente o capital ou escolha outro ativo.`
      );
    }
    
    console.log('✅ Notional OK - Prosseguindo com a ordem');
    
    console.log('\n================================================================================');
    console.log('📡 ORDEM FINAL ENVIADA À BINANCE');
    console.log('================================================================================');
    console.log(`🎯 Symbol: ${asset}`);
    console.log(`📊 Side: ${side} (${direction})`);
    console.log(`💰 Quantity original: ${quantity}`);
    console.log(`💰 Quantity calculada: ${calculatedQuantity}`);
    console.log(`💰 Quantity formatada: ${formattedQuantity}`);
    console.log(`💵 Notional final: $${finalNotional.toFixed(2)}`);
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

    // 🔍 VERIFICAÇÃO PÓS-CRIAÇÃO: Aguardar 2s e verificar se ordem ainda está ativa
    console.log('⏳ Aguardando 2s para verificar status da ordem...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const orderCheckTimestamp = Date.now();
    const orderCheckParams = new URLSearchParams({
      symbol: asset,
      orderId: binanceResult.orderId.toString(),
      timestamp: orderCheckTimestamp.toString(),
    });

    const orderCheckEncoder = new TextEncoder();
    const orderCheckKey = await crypto.subtle.importKey(
      'raw',
      orderCheckEncoder.encode(userApiSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const orderCheckSignature = await crypto.subtle.sign(
      'HMAC',
      orderCheckKey,
      orderCheckEncoder.encode(orderCheckParams.toString())
    );
    const orderCheckSignatureHex = Array.from(new Uint8Array(orderCheckSignature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    orderCheckParams.append('signature', orderCheckSignatureHex);

    const orderCheckResponse = await fetch(
      `https://fapi.binance.com/fapi/v1/order?${orderCheckParams}`,
      { headers: { 'X-MBX-APIKEY': userApiKey } }
    );

    if (orderCheckResponse.ok) {
      const currentOrderStatus = await orderCheckResponse.json();
      console.log(`📊 Status atual da ordem: ${currentOrderStatus.status}`);
      
      if (currentOrderStatus.status === 'CANCELED' || currentOrderStatus.status === 'EXPIRED') {
        console.error(`❌ Ordem foi ${currentOrderStatus.status} - NÃO salvar no DB`);
        throw new Error(`Ordem foi ${currentOrderStatus.status} após criação - possivelmente fechada imediatamente`);
      }
      
      console.log('✅ Ordem confirmada ativa após 2 segundos');
    } else {
      console.warn('⚠️ Não foi possível verificar status da ordem, continuando...');
    }

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

    // ═══════════════════════════════════════════════════════════════════════════
    // 🛡️ FASE 1: ENVIAR STOP LOSS E TAKE PROFIT PARA BINANCE (CRÍTICO!)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n🛡️ ENVIANDO ORDENS DE PROTEÇÃO PARA BINANCE...');
    
    // 🔧 PASSO 1: BUSCAR PRECISÃO DE PREÇO DO SÍMBOLO
    console.log('\n🔧 Buscando precisão de preço para formatação...');
    const priceFilterResponse = await fetch(
      `https://fapi.binance.com/fapi/v1/exchangeInfo?symbol=${asset}`,
      { headers: { 'X-MBX-APIKEY': userApiKey } }
    );
    const priceFilterData = await priceFilterResponse.json();
    const priceSymbolInfo = priceFilterData.symbols[0]; // ✅ Renomeado para evitar conflito
    const pricePrecision = priceSymbolInfo.pricePrecision;
    
    console.log(`\n🔧 FORMATANDO PREÇOS DE PROTEÇÃO:`);
    console.log(`├─ Stop Loss original: $${finalStopLoss}`);
    console.log(`├─ Take Profit original: $${finalTakeProfit}`);
    console.log(`└─ Precisão de preço: ${pricePrecision} decimais`);
    
    // ✅ FORMATAR COM PRECISÃO CORRETA
    const formattedStopLoss = parseFloat(finalStopLoss.toFixed(pricePrecision));
    const formattedTakeProfit = parseFloat(finalTakeProfit.toFixed(pricePrecision));
    
    console.log(`\n✅ PREÇOS FORMATADOS:`);
    console.log(`├─ Stop Loss: $${formattedStopLoss}`);
    console.log(`└─ Take Profit: $${formattedTakeProfit}`);
    
    let stopOrderId = null;
    let takeProfitOrderId = null;

    try {
      // 1️⃣ ENVIAR STOP LOSS (STOP_MARKET)
      console.log(`\n1️⃣ Criando STOP LOSS em ${formattedStopLoss}...`);
      
      const stopSide = direction === 'BUY' ? 'SELL' : 'BUY'; // Oposto da entrada
      const stopTimestamp = Date.now();
      const stopParams = new URLSearchParams({
        symbol: asset,
        side: stopSide,
        type: 'STOP_MARKET',
        stopPrice: formattedStopLoss.toString(), // ✅ Usar valor formatado
        closePosition: 'true',
        workingType: 'MARK_PRICE',
        timestamp: stopTimestamp.toString(),
      });

      const stopEncoder = new TextEncoder();
      const stopKey = await crypto.subtle.importKey(
        'raw',
        stopEncoder.encode(userApiSecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const stopSignature = await crypto.subtle.sign(
        'HMAC',
        stopKey,
        stopEncoder.encode(stopParams.toString())
      );
      const stopSignatureHex = Array.from(new Uint8Array(stopSignature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      stopParams.append('signature', stopSignatureHex);

      const stopResponse = await fetch(
        `https://fapi.binance.com/fapi/v1/order?${stopParams}`,
        { 
          method: 'POST',
          headers: { 'X-MBX-APIKEY': userApiKey }
        }
      );

      if (stopResponse.ok) {
        const stopResult = await stopResponse.json();
        stopOrderId = stopResult.orderId;
        console.log(`✅ Stop Loss criado: Order ID ${stopOrderId}`);
        
        // 🔍 VERIFICAÇÃO PÓS-STOP-LOSS: Aguardar 1s e verificar se posição ainda existe
        console.log('⏳ Aguardando 1s para verificar se posição ainda existe...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const verifyPosTimestamp = Date.now();
        const verifyPosParams = new URLSearchParams({
          timestamp: verifyPosTimestamp.toString(),
        });
        
        const verifyPosEncoder = new TextEncoder();
        const verifyPosKey = await crypto.subtle.importKey(
          'raw',
          verifyPosEncoder.encode(userApiSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const verifyPosSignature = await crypto.subtle.sign(
          'HMAC',
          verifyPosKey,
          verifyPosEncoder.encode(verifyPosParams.toString())
        );
        const verifyPosSignatureHex = Array.from(new Uint8Array(verifyPosSignature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        verifyPosParams.append('signature', verifyPosSignatureHex);
        
        const verifyPosResponse = await fetch(
          `https://fapi.binance.com/fapi/v2/positionRisk?${verifyPosParams}`,
          { headers: { 'X-MBX-APIKEY': userApiKey } }
        );
        
        if (verifyPosResponse.ok) {
          const allPositions = await verifyPosResponse.json();
          const currentPosition = allPositions.find((p: any) => 
            p.symbol === asset && parseFloat(p.positionAmt) !== 0
          );
          
          if (!currentPosition) {
            // 🔍 VERIFICAR SE FOI FECHADA OU SE NEM ABRIU
            console.log('⚠️ Posição não encontrada - verificando histórico de trades...');
            
            const tradesTimestamp = Date.now();
            const tradesParams = new URLSearchParams({
              symbol: asset,
              limit: '10',
              timestamp: tradesTimestamp.toString(),
            });
            
            const tradesEncoder = new TextEncoder();
            const tradesKey = await crypto.subtle.importKey(
              'raw',
              tradesEncoder.encode(userApiSecret),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const tradesSignature = await crypto.subtle.sign(
              'HMAC',
              tradesKey,
              tradesEncoder.encode(tradesParams.toString())
            );
            const tradesSignatureHex = Array.from(new Uint8Array(tradesSignature))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            tradesParams.append('signature', tradesSignatureHex);
            
            const tradesResponse = await fetch(
              `https://fapi.binance.com/fapi/v1/userTrades?${tradesParams}`,
              { headers: { 'X-MBX-APIKEY': userApiKey } }
            );
            
            if (tradesResponse.ok) {
              const trades = await tradesResponse.json();
              const recentTrade = trades.find((t: any) => t.orderId === binanceResult.orderId); // ✅ Usar binanceResult.orderId
              
              if (recentTrade) {
                console.log('✅ Posição foi EXECUTADA mas já FECHADA - Permitir salvar no DB como histórico');
                // NÃO lançar erro, permitir salvar
              } else {
                console.error('❌ Ordem NEM FOI EXECUTADA - possivelmente rejeitada');
                throw new Error('Ordem rejeitada pela Binance');
              }
            } else {
              console.warn('⚠️ Não foi possível verificar trades - assumindo posição fechada rapidamente');
              // Permitir salvar mesmo assim
            }
          }
          
          console.log('✅ Posição confirmada ativa na Binance após Stop Loss');
        } else {
          console.warn('⚠️ Não foi possível verificar posição, continuando...');
        }
      } else {
        const stopErrorText = await stopResponse.text();
        const stopError = JSON.parse(stopErrorText);
        console.error(`❌ ERRO ao criar Stop Loss:`, stopError);
        
        // 🔄 SE FOR ERRO DE PRECISÃO, RETENTAR COM ARREDONDAMENTO
        if (stopError.code === -1111) {
          console.log('🔄 Erro de precisão detectado - Retentando com arredondamento para 2 decimais...');
          
          const roundedStopLoss = parseFloat(formattedStopLoss.toFixed(2));
          console.log(`   Stop Loss arredondado: ${roundedStopLoss}`);
          
          const retryStopTimestamp = Date.now();
          const retryStopParams = new URLSearchParams({
            symbol: asset,
            side: stopSide,
            type: 'STOP_MARKET',
            stopPrice: roundedStopLoss.toString(),
            closePosition: 'true',
            workingType: 'MARK_PRICE',
            timestamp: retryStopTimestamp.toString(),
          });
          
          const retryStopEncoder = new TextEncoder();
          const retryStopKey = await crypto.subtle.importKey(
            'raw',
            retryStopEncoder.encode(userApiSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const retryStopSignature = await crypto.subtle.sign(
            'HMAC',
            retryStopKey,
            retryStopEncoder.encode(retryStopParams.toString())
          );
          const retryStopSignatureHex = Array.from(new Uint8Array(retryStopSignature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          retryStopParams.append('signature', retryStopSignatureHex);
          
          const retryStopResponse = await fetch(
            `https://fapi.binance.com/fapi/v1/order?${retryStopParams}`,
            { 
              method: 'POST',
              headers: { 'X-MBX-APIKEY': userApiKey }
            }
          );
          
          if (!retryStopResponse.ok) {
            const retryError = await retryStopResponse.text();
            console.error('❌ RETRY FALHOU:', retryError);
            console.log('🚨 FECHANDO POSIÇÃO POR SEGURANÇA...');
            
            const closeTimestamp = Date.now();
            const closeParams = new URLSearchParams({
              symbol: asset,
              side: stopSide,
              type: 'MARKET',
              quantity: formattedQuantity.toString(),
              timestamp: closeTimestamp.toString(),
            });
            
            const closeEncoder = new TextEncoder();
            const closeKey = await crypto.subtle.importKey(
              'raw',
              closeEncoder.encode(userApiSecret),
              { name: 'HMAC', hash: 'SHA-256' },
              false,
              ['sign']
            );
            const closeSignature = await crypto.subtle.sign(
              'HMAC',
              closeKey,
              closeEncoder.encode(closeParams.toString())
            );
            const closeSignatureHex = Array.from(new Uint8Array(closeSignature))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            closeParams.append('signature', closeSignatureHex);
            
            await fetch(
              `https://fapi.binance.com/fapi/v1/order?${closeParams}`,
              { 
                method: 'POST',
                headers: { 'X-MBX-APIKEY': userApiKey }
              }
            );
            
            throw new Error('Stop Loss falhou após retry - posição fechada por segurança');
          } else {
            const retryResult = await retryStopResponse.json();
            stopOrderId = retryResult.orderId;
            console.log(`✅ Stop Loss criado após retry: Order ID ${stopOrderId}`);
          }
        } else if (stopError.code === -4045) {
          // Erro de limite de stop orders - não fechar posição
          console.error('⚠️ Limite de stop orders atingido - posição mantida SEM proteção');
          console.error('   Execute "Cancelar Ordens Binance" e tente novamente');
        } else {
          // OUTRO TIPO DE ERRO - FECHAR POSIÇÃO
          console.log('🚨 FECHANDO POSIÇÃO POR SEGURANÇA...');
          const closeTimestamp = Date.now();
          const closeParams = new URLSearchParams({
            symbol: asset,
            side: stopSide,
            type: 'MARKET',
            quantity: formattedQuantity.toString(),
            timestamp: closeTimestamp.toString(),
          });
          
          const closeEncoder = new TextEncoder();
          const closeKey = await crypto.subtle.importKey(
            'raw',
            closeEncoder.encode(userApiSecret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
          );
          const closeSignature = await crypto.subtle.sign(
            'HMAC',
            closeKey,
            closeEncoder.encode(closeParams.toString())
          );
          const closeSignatureHex = Array.from(new Uint8Array(closeSignature))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          closeParams.append('signature', closeSignatureHex);
          
          await fetch(
            `https://fapi.binance.com/fapi/v1/order?${closeParams}`,
            { 
              method: 'POST',
              headers: { 'X-MBX-APIKEY': userApiKey }
            }
          );
          
          throw new Error(`Stop Loss falhou (${stopError.code}) - posição fechada por segurança`);
        }
      }

      // 2️⃣ ENVIAR TAKE PROFIT (TAKE_PROFIT_MARKET) - COM VALIDAÇÃO
      console.log(`\n2️⃣ Validando e criando TAKE PROFIT em ${finalTakeProfit}...`);
      
      // 🔍 VALIDAÇÃO: Buscar preço atual antes de criar TP
      const tpValidationResponse = await fetch(
        `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${asset}`
      );
      const tpValidationData = await tpValidationResponse.json();
      const currentMarketPrice = parseFloat(tpValidationData.price);
      
      let canCreateTP = true;
      if (direction === 'BUY' && finalTakeProfit <= currentMarketPrice) {
        console.log(`⚠️ TP ($${finalTakeProfit}) já ultrapassado! Atual: $${currentMarketPrice}`);
        canCreateTP = false;
      } else if (direction === 'SELL' && finalTakeProfit >= currentMarketPrice) {
        console.log(`⚠️ TP ($${finalTakeProfit}) já ultrapassado! Atual: $${currentMarketPrice}`);
        canCreateTP = false;
      }
      
      if (!canCreateTP) {
        console.log('⏭️ Pulando TP - criando apenas Stop Loss');
      } else {
        const tpTimestamp = Date.now();
        const tpParams = new URLSearchParams({
          symbol: asset,
          side: stopSide,
          type: 'TAKE_PROFIT_MARKET',
          stopPrice: formattedTakeProfit.toString(), // ✅ Usar valor formatado
          closePosition: 'true',
          workingType: 'MARK_PRICE',
          timestamp: tpTimestamp.toString(),
        });

        const tpEncoder = new TextEncoder();
        const tpKey = await crypto.subtle.importKey(
          'raw',
          tpEncoder.encode(userApiSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['sign']
        );
        const tpSignature = await crypto.subtle.sign(
          'HMAC',
          tpKey,
          tpEncoder.encode(tpParams.toString())
        );
        const tpSignatureHex = Array.from(new Uint8Array(tpSignature))
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
        tpParams.append('signature', tpSignatureHex);

        const tpResponse = await fetch(
          `https://fapi.binance.com/fapi/v1/order?${tpParams}`,
          { 
            method: 'POST',
            headers: { 'X-MBX-APIKEY': userApiKey }
          }
        );

        if (tpResponse.ok) {
          const tpResult = await tpResponse.json();
          takeProfitOrderId = tpResult.orderId;
          console.log(`✅ Take Profit criado: Order ID ${takeProfitOrderId}`);
        } else {
          const tpError = await tpResponse.text();
          console.error(`⚠️ ERRO ao criar Take Profit (continuando apenas com stop):`, tpError);
          // Continuar apenas com stop loss - não é crítico
        }
      }

      console.log(`\n✅ ORDENS DE PROTEÇÃO CONFIGURADAS NA BINANCE:`);
      console.log(`   ├─ 🛑 Stop Loss: ${finalStopLoss} (Order ID: ${stopOrderId})`);
      console.log(`   └─ 🎯 Take Profit: ${finalTakeProfit} (Order ID: ${takeProfitOrderId || 'N/A'})`);
      
    } catch (protectionError: any) {
      console.error('❌ ERRO CRÍTICO nas ordens de proteção:', protectionError);
      throw new Error(`Falha ao configurar proteção: ${protectionError?.message || String(protectionError)}`);
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
      
      // 🔄 SINCRONIZAÇÃO IMEDIATA: Chamar sync-binance-positions
      try {
        console.log('🔄 Iniciando sincronização imediata com Binance...');
        const syncResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/sync-binance-positions`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ user_id })
          }
        );
        
        if (syncResponse.ok) {
          const syncResult = await syncResponse.json();
          console.log('✅ Sincronização imediata concluída:', syncResult);
        } else {
          const syncError = await syncResponse.text();
          console.warn('⚠️ Falha na sincronização imediata (não crítico):', syncError);
        }
      } catch (syncError) {
        console.warn('⚠️ Erro na sincronização imediata (não crítico):', syncError);
      }
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
      
      // Log em agent_logs
      await supabase
        .from('agent_logs')
        .insert({
          user_id,
          agent_name: 'BINANCE_ORDER',
          asset,
          status: 'error',
          data: {
            error: 'Failed to insert operation',
            details: opError,
            entry_price: entryPriceReal,
            direction
          }
        });
      
      // ⚠️ Ordem FOI executada na Binance, mas falhou ao registrar
      // NÃO reverter ordem, apenas logar erro grave
    } else {
      console.log('✅ Operation inserida com sucesso em operations');
      
      // 📝 LOG DE SUCESSO - REAL MODE
      await supabase
        .from('agent_logs')
        .insert({
          user_id,
          agent_name: 'BINANCE_ORDER',
          asset,
          status: 'success',
          data: {
            mode: 'REAL',
            message: 'Order executed successfully on Binance',
            binance_order_id: binanceResult?.orderId || 'N/A',
            entry_price: entryPriceReal,
            current_price: currentPriceReal,
            pnl: pnlReal,
            direction,
            stop_loss: finalStopLoss,
            take_profit: finalTakeProfit,
            actual_quantity: binanceResult?.executedQty || formattedQuantity,
            session,
            timestamp: new Date().toISOString()
          }
        });
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
