import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, symbol } = await req.json();

    if (!user_id) {
      throw new Error('user_id is required');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Buscar API keys do usuário
    const { data: settings } = await supabase
      .from('user_settings')
      .select('api_key, api_secret')
      .eq('user_id', user_id)
      .single();

    if (!settings?.api_key || !settings?.api_secret) {
      throw new Error('API keys não configuradas');
    }

    const userApiKey = settings.api_key;
    const userApiSecret = settings.api_secret;

    console.log(`\n🗑️ CANCELANDO TODAS AS ORDENS ABERTAS`);
    console.log(`Symbol: ${symbol || 'TODOS'}`);

    const timestamp = Date.now();
    
    let params: URLSearchParams;
    if (symbol) {
      params = new URLSearchParams({
        symbol: symbol,
        timestamp: timestamp.toString(),
      });
    } else {
      params = new URLSearchParams({
        timestamp: timestamp.toString(),
      });
    }

    // Criar assinatura HMAC
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

    // Cancelar todas as ordens abertas
    const cancelUrl = symbol 
      ? `https://fapi.binance.com/fapi/v1/allOpenOrders?${params.toString()}`
      : `https://fapi.binance.com/fapi/v1/allOpenOrders?${params.toString()}`;

    const cancelResponse = await fetch(cancelUrl, {
      method: 'DELETE',
      headers: {
        'X-MBX-APIKEY': userApiKey,
      }
    });

    if (!cancelResponse.ok) {
      const errorData = await cancelResponse.json();
      console.error(`❌ Erro ao cancelar ordens: ${JSON.stringify(errorData)}`);
      throw new Error(`Erro Binance: ${errorData.msg || errorData.code}`);
    }

    const result = await cancelResponse.json();
    console.log(`✅ Ordens canceladas com sucesso:`, result);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Todas as ordens abertas foram canceladas`,
        result 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in cancel-all-orders:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
