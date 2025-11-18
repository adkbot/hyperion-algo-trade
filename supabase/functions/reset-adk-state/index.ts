import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Iniciando reset diário do estado ADK...');

    // Obter a data atual no formato YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Data atual: ${today}`);

    // Deletar todos os estados ADK do dia anterior
    const { error: deleteError, count: deletedCount } = await supabase
      .from('adk_strategy_state')
      .delete({ count: 'exact' })
      .neq('date', today);

    if (deleteError) {
      console.error('❌ Erro ao deletar estados antigos:', deleteError);
      throw deleteError;
    }

    console.log(`✅ Estados ADK antigos deletados: ${deletedCount || 0} registros`);

    // Contar quantos estados restaram (devem ser apenas do dia atual)
    const { count, error: countError } = await supabase
      .from('adk_strategy_state')
      .select('*', { count: 'exact', head: true })
      .eq('date', today);

    if (countError) {
      console.error('❌ Erro ao contar estados atuais:', countError);
      throw countError;
    }

    console.log(`📊 Estados ADK para hoje (${today}): ${count || 0} registros`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Reset diário do estado ADK concluído com sucesso',
        date: today,
        deletedRecords: deletedCount || 0,
        currentRecords: count || 0,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Erro no reset diário do ADK:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
