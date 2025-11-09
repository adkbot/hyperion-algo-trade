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

    console.log(`Processing order for user ${user_id}:`, { asset, direction, quantity, price });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
          stop_loss: stopLoss,
          take_profit: takeProfit,
          risk_reward: riskReward,
          current_pnl: 0,
          projected_profit: (takeProfit - price) * quantity,
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
          stop_loss: stopLoss,
          take_profit: takeProfit,
          risk_reward: riskReward,
          result: 'OPEN',
          agents,
          session,
        });

      if (opError) {
        console.error('Error inserting operation:', opError);
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

    const timestamp = Date.now();
    const params = new URLSearchParams({
      symbol: asset,
      side: direction,
      type: 'MARKET',
      quantity: quantity.toString(),
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

    console.log(`📡 Sending order to Binance: ${asset} ${direction} @ ${price}`);

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

    // ✅ Save to database COM user_id
    const { error: insertError } = await supabase
      .from('active_positions')
      .insert({
        user_id,
        asset,
        direction,
        entry_price: price,
        current_price: price,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_reward: riskReward,
        current_pnl: 0,
        projected_profit: (takeProfit - price) * quantity,
        agents,
        session,
      });

    if (insertError) {
      console.error('Error inserting position:', insertError);
    }

    // ✅ Insert operation COM user_id
    const { error: opError } = await supabase
      .from('operations')
      .insert({
        user_id,
        asset,
        direction,
        entry_price: price,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_reward: riskReward,
        result: 'OPEN',
        agents,
        session,
      });

    if (opError) {
      console.error('Error inserting operation:', opError);
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
