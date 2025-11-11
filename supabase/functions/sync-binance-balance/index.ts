import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

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
      throw new Error("user_id é obrigatório");
    }

    console.log(`🔄 Iniciando sincronização de saldo para user: ${user_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar configurações do usuário
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('balance, binance_api_key, binance_api_secret')
      .eq('user_id', user_id)
      .single();

    if (settingsError || !settings) {
      throw new Error(`Configurações não encontradas: ${settingsError?.message}`);
    }

    const oldBalance = settings.balance || 0;
    console.log(`💰 Saldo atual no DB: $${oldBalance.toFixed(2)}`);

    // Se não tiver API keys, retornar erro
    if (!settings.binance_api_key || !settings.binance_api_secret) {
      throw new Error("API Keys da Binance não configuradas");
    }

    // Buscar saldo real da Binance
    const timestamp = Date.now();
    const params = `timestamp=${timestamp}`;
    
    // Gerar assinatura HMAC
    const encoder = new TextEncoder();
    const keyData = encoder.encode(settings.binance_api_secret);
    const messageData = encoder.encode(params);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const binanceUrl = `https://fapi.binance.com/fapi/v2/account?${params}&signature=${hashHex}`;
    
    const binanceResponse = await fetch(binanceUrl, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': settings.binance_api_key,
      },
    });

    if (!binanceResponse.ok) {
      const errorText = await binanceResponse.text();
      throw new Error(`Erro ao buscar saldo da Binance: ${errorText}`);
    }

    const accountData = await binanceResponse.json();
    
    // Encontrar saldo disponível em USDT
    const usdtAsset = accountData.assets?.find((a: any) => a.asset === 'USDT');
    const newBalance = parseFloat(usdtAsset?.availableBalance || '0');

    console.log(`💰 Saldo real na Binance: $${newBalance.toFixed(2)}`);
    
    const difference = newBalance - oldBalance;
    console.log(`📊 Diferença: $${difference.toFixed(2)} (${difference >= 0 ? '+' : ''}${((difference / oldBalance) * 100).toFixed(2)}%)`);

    // Atualizar saldo no banco
    const { error: updateError } = await supabase
      .from('user_settings')
      .update({ 
        balance: newBalance,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user_id);

    if (updateError) {
      throw new Error(`Erro ao atualizar saldo: ${updateError.message}`);
    }

    console.log(`✅ Saldo sincronizado com sucesso: $${oldBalance.toFixed(2)} → $${newBalance.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        oldBalance,
        newBalance,
        difference,
        percentageChange: ((difference / oldBalance) * 100).toFixed(2),
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro ao sincronizar saldo:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        success: false
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
