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
    const { asset, direction, quantity, price, stopLoss, takeProfit, agents, session, riskReward } = await req.json();

    console.log('Processing order:', { asset, direction, quantity, price });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get settings
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to fetch user settings');
    }

    // Check if paper trading mode
    if (settings.paper_mode) {
      console.log('PAPER MODE: Simulating order');
      
      // Save to active_positions
      const { error: insertError } = await supabase
        .from('active_positions')
        .insert({
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

      // Save to operations
      const { error: opError } = await supabase
        .from('operations')
        .insert({
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
    if (!BINANCE_API_KEY || !BINANCE_API_SECRET) {
      throw new Error('Binance API credentials not configured');
    }

    const timestamp = Date.now();
    const params = new URLSearchParams({
      symbol: asset,
      side: direction,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity: quantity.toString(),
      price: price.toString(),
      timestamp: timestamp.toString(),
    });

    // Create HMAC signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(BINANCE_API_SECRET),
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

    // Send order to Binance
    const response = await fetch(`https://fapi.binance.com/fapi/v1/order?${params}`, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': BINANCE_API_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Binance API error:', errorText);
      throw new Error(`Binance API error: ${errorText}`);
    }

    const binanceResult = await response.json();
    console.log('Order executed on Binance:', binanceResult);

    // Save to database
    const { error: insertError } = await supabase
      .from('active_positions')
      .insert({
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

    const { error: opError } = await supabase
      .from('operations')
      .insert({
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
        binanceOrder: binanceResult 
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
