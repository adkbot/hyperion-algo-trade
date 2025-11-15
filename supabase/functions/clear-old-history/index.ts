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

    const { user_id, delete_all } = await req.json();
    
    if (!user_id) {
      throw new Error('user_id é obrigatório');
    }

    console.log(`🧹 Limpando histórico para user ${user_id} (delete_all: ${delete_all})`);

    // Contar registros antes da limpeza
    const { count: beforeCount } = await supabase
      .from('session_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    let deleteQuery = supabase
      .from('session_history')
      .delete({ count: 'exact' })
      .eq('user_id', user_id);

    // Se delete_all for false, deletar apenas registros antigos (antes de hoje)
    if (!delete_all) {
      const today = new Date().toISOString().split('T')[0];
      deleteQuery = deleteQuery.lt('timestamp', `${today}T00:00:00Z`);
    }
    
    const { error: historyError, count: deletedCount } = await deleteQuery;

    if (historyError) throw historyError;

    // Contar registros após limpeza
    const { count: afterCount } = await supabase
      .from('session_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    console.log(`✅ Limpeza concluída:`);
    console.log(`   - Antes: ${beforeCount} registros`);
    console.log(`   - Deletados: ${deletedCount} registros`);
    console.log(`   - Após: ${afterCount} registros (apenas hoje)`);

    const message = delete_all 
      ? `✅ TODOS os ${deletedCount} registros foram removidos.`
      : `✅ ${deletedCount} registros antigos removidos. Mantidos ${afterCount} de hoje.`;

    return new Response(
      JSON.stringify({
        success: true,
        message,
        stats: {
          before: beforeCount,
          deleted: deletedCount,
          after: afterCount,
        }
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
