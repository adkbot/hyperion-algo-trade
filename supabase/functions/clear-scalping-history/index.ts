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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { user_id } = await req.json();
    
    if (!user_id) {
      throw new Error('user_id é obrigatório');
    }

    console.log(`🧹 Limpando histórico dos últimos 7 dias para user ${user_id}`);

    // Limpar session_history dos últimos 7 dias (exceto hoje)
    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);
    
    const todayStr = today.toISOString().split('T')[0];
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    const { error: historyError } = await supabase
      .from('session_history')
      .delete()
      .eq('user_id', user_id)
      .gte('timestamp', `${sevenDaysAgoStr}T00:00:00Z`)
      .lt('timestamp', `${todayStr}T00:00:00Z`);

    if (historyError) throw historyError;

    // Limpar agent_logs dos últimos 7 dias (exceto hoje)
    const { error: logsError } = await supabase
      .from('agent_logs')
      .delete()
      .eq('user_id', user_id)
      .gte('created_at', `${sevenDaysAgoStr}T00:00:00Z`)
      .lt('created_at', `${todayStr}T00:00:00Z`);

    if (logsError) throw logsError;

    console.log(`✅ Histórico dos últimos 7 dias foi limpo com sucesso`);

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Histórico dos últimos 7 dias foi limpo! Apenas dados de hoje permanecem.',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
