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

    console.log(`🧹 Limpando histórico antigo para user ${user_id}`);

    // Contar registros antes da limpeza
    const { count: beforeCount } = await supabase
      .from('session_history')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id);

    // Deletar TUDO exceto hoje
    const today = new Date().toISOString().split('T')[0];
    
    const { error: historyError, count: deletedCount } = await supabase
      .from('session_history')
      .delete({ count: 'exact' })
      .eq('user_id', user_id)
      .lt('timestamp', `${today}T00:00:00Z`);

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

    return new Response(
      JSON.stringify({
        success: true,
        message: `✅ ${deletedCount} registros antigos removidos. Mantidos ${afterCount} de hoje.`,
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
