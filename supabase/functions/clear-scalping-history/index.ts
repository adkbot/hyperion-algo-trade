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

    console.log(`🧹 Limpando todo histórico antigo para user ${user_id}`);

    // Limpar TODO session_history (todos os dias anteriores)
    const today = new Date().toISOString().split('T')[0];
    
    const { error: historyError } = await supabase
      .from('session_history')
      .delete()
      .eq('user_id', user_id)
      .lt('timestamp', `${today}T00:00:00Z`); // Tudo ANTES de hoje

    if (historyError) throw historyError;

    // Limpar TODO agent_logs também
    const { error: logsError } = await supabase
      .from('agent_logs')
      .delete()
      .eq('user_id', user_id)
      .lt('created_at', `${today}T00:00:00Z`); // Tudo ANTES de hoje

    if (logsError) throw logsError;

    console.log(`✅ Todo histórico anterior a hoje foi limpo com sucesso`);

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Todo histórico antigo foi limpo com sucesso! Apenas dados de hoje permanecem.',
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
