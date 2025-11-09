import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    console.log(`🔍 Testing Binance connection for user: ${user.id}`);

    // Fetch user settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('user_settings')
      .select('api_key, api_secret, paper_mode, balance, leverage')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings) {
      throw new Error('User settings not found');
    }

    console.log(`📊 User Settings:`, {
      has_api_key: !!settings.api_key,
      has_api_secret: !!settings.api_secret,
      paper_mode: settings.paper_mode,
      balance: settings.balance,
      leverage: settings.leverage,
    });

    // If in paper mode
    if (settings.paper_mode) {
      return new Response(
        JSON.stringify({
          success: true,
          mode: 'PAPER',
          message: 'Modo Paper Trading - Sem conexão real com Binance',
          settings: {
            balance: settings.balance,
            leverage: settings.leverage,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if API credentials exist
    if (!settings.api_key || !settings.api_secret) {
      throw new Error('Binance API credentials not configured');
    }

    // Generate signature for Binance request
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(settings.api_secret);
    const messageData = encoder.encode(queryString);
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', key, messageData);
    const signatureHex = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Test connection to Binance Futures API
    console.log(`🌐 Calling Binance Futures API...`);
    
    const response = await fetch(
      `${BINANCE_FUTURES_BASE}/fapi/v2/account?${queryString}&signature=${signatureHex}`,
      {
        headers: {
          'X-MBX-APIKEY': settings.api_key,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ Binance API Error:`, data);
      return new Response(
        JSON.stringify({
          success: false,
          mode: 'REAL',
          error: data.msg || 'Binance API error',
          code: data.code,
          details: data,
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`✅ Binance connection successful!`);

    // Extract relevant account info
    const accountInfo = {
      totalWalletBalance: data.totalWalletBalance,
      availableBalance: data.availableBalance,
      totalUnrealizedProfit: data.totalUnrealizedProfit,
      canTrade: data.canTrade,
      canDeposit: data.canDeposit,
      canWithdraw: data.canWithdraw,
      positions: data.positions?.filter((p: any) => parseFloat(p.positionAmt) !== 0).length || 0,
    };

    return new Response(
      JSON.stringify({
        success: true,
        mode: 'REAL',
        message: '✅ Conexão com Binance Futures estabelecida',
        account: accountInfo,
        settings: {
          leverage: settings.leverage,
          configured_balance: settings.balance,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error testing Binance connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
