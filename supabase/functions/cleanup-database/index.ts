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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      throw new Error('Invalid user token');
    }

    const today = new Date().toISOString().split('T')[0];

    console.log(`🧹 Iniciando limpeza completa do banco para user: ${user.id}, data: ${today}`);

    // ETAPA 1: Atualizar daily_goals de hoje
    console.log('📋 ETAPA 1: Atualizando daily_goals de hoje...');
    const { data: updatedGoals, error: goalsError } = await supabaseClient
      .from('daily_goals')
      .update({
        target_operations: 4,
        target_pnl_percent: 12.0,
        max_losses: 2,
        total_operations: 0,
        wins: 0,
        losses: 0,
        total_pnl: 0,
        completed: false
      })
      .eq('date', today)
      .eq('user_id', user.id)
      .select();

    if (goalsError) throw goalsError;
    console.log(`✅ Daily goals atualizados:`, updatedGoals);

    // ETAPA 2: Limpar session_history antigo (antes de hoje)
    console.log('📋 ETAPA 2: Limpando session_history antigo...');
    const { data: deletedHistory, error: historyError } = await supabaseClient
      .from('session_history')
      .delete()
      .eq('user_id', user.id)
      .lt('timestamp', today)
      .select();

    if (historyError) throw historyError;
    console.log(`✅ Session history removidos: ${deletedHistory?.length || 0} registros`);

    // ETAPA 3: Limpar operations antigas (antes de hoje)
    console.log('📋 ETAPA 3: Limpando operations antigas...');
    const { data: deletedOps, error: opsError } = await supabaseClient
      .from('operations')
      .delete()
      .eq('user_id', user.id)
      .lt('entry_time', today)
      .select();

    if (opsError) throw opsError;
    console.log(`✅ Operations removidas: ${deletedOps?.length || 0} registros`);

    // ETAPA 4: Limpar session_trade_count antigo
    console.log('📋 ETAPA 4: Limpando session_trade_count antigo...');
    const { data: deletedCount, error: countError } = await supabaseClient
      .from('session_trade_count')
      .delete()
      .eq('user_id', user.id)
      .lt('date', today)
      .select();

    if (countError) throw countError;
    console.log(`✅ Session trade count removidos: ${deletedCount?.length || 0} registros`);

    // ETAPA 5: Limpar daily_goals muito antigos (mais de 7 dias)
    console.log('📋 ETAPA 5: Limpando daily_goals antigos (>7 dias)...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const { data: deletedGoals, error: oldGoalsError } = await supabaseClient
      .from('daily_goals')
      .delete()
      .eq('user_id', user.id)
      .lt('date', sevenDaysAgoStr)
      .select();

    if (oldGoalsError) throw oldGoalsError;
    console.log(`✅ Daily goals antigos removidos: ${deletedGoals?.length || 0} registros`);

    // Verificação final
    const { count: historyCount } = await supabaseClient
      .from('session_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: opsCount } = await supabaseClient
      .from('operations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    console.log(`\n✅ LIMPEZA COMPLETA FINALIZADA`);
    console.log(`📊 Registros restantes:`);
    console.log(`   - session_history: ${historyCount}`);
    console.log(`   - operations: ${opsCount}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Limpeza completa executada com sucesso',
        summary: {
          daily_goals_updated: updatedGoals?.length || 0,
          session_history_deleted: deletedHistory?.length || 0,
          operations_deleted: deletedOps?.length || 0,
          session_trade_count_deleted: deletedCount?.length || 0,
          old_daily_goals_deleted: deletedGoals?.length || 0,
          remaining: {
            session_history: historyCount,
            operations: opsCount
          }
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ Erro na limpeza do banco:', error);
    
    let errorMessage = 'Erro desconhecido';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    }
    
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
