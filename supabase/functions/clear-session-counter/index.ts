import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { user_id, session } = await req.json();

    if (!user_id) {
      throw new Error('user_id is required');
    }

    const today = new Date().toISOString().split('T')[0];

    console.log(`🧹 Limpando contador de sessão para user ${user_id}, sessão ${session || 'TODAS'}, data ${today}`);

    // Se session for fornecida, limpar apenas essa sessão
    // Caso contrário, limpar todas as sessões do dia
    let query = supabaseClient
      .from('session_trade_count')
      .delete()
      .eq('user_id', user_id)
      .eq('date', today);

    if (session) {
      query = query.eq('session', session);
    }

    const { error } = await query;

    if (error) {
      console.error('Erro ao limpar contador:', error);
      throw error;
    }

    console.log('✅ Contador de sessão limpo com sucesso');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Session counter cleared successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
