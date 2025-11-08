import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.78.0';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { user_id, asset, side, quantity } = await req.json();

    if (!user_id || !asset || !side || !quantity) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    // If paper mode, just log and return success
    if (paperMode) {
      console.log(`📋 Paper mode: simulating close order for ${asset}`);
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'paper',
          message: 'Order simulated (paper mode)',
          asset,
          side,
          quantity: parseFloat(quantity),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Real Binance order execution
    console.log(`🔥 REAL MODE: Closing position on Binance for ${asset}`);

    const timestamp = Date.now();
    const queryString = `symbol=${asset}&side=${side}&type=MARKET&quantity=${quantity}&timestamp=${timestamp}`;
    
    const signature = createHmac('sha256', apiSecret)
      .update(queryString)
      .digest('hex');

    const url = `https://fapi.binance.com/fapi/v1/order?${queryString}&signature=${signature}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-MBX-APIKEY': apiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Binance API error:', data);
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

    console.log(`✅ Position closed successfully on Binance:`, data);

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'real',
        binance_response: data,
        asset,
        side,
        quantity: parseFloat(quantity),
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
