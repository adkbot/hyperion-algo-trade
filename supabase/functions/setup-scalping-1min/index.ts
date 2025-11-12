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

    console.log(`🎯 Configurando Scalping 1 Min para user ${user_id}`);

    // 1. Atualizar estratégia no user_settings
    const { error: settingsError } = await supabase
      .from('user_settings')
      .update({ trading_strategy: 'SCALPING_1MIN' })
      .eq('user_id', user_id);

    if (settingsError) throw settingsError;

    // 2. Atualizar daily_goals de hoje
    const today = new Date().toISOString().split('T')[0];
    
    const { error: goalsError } = await supabase
      .from('daily_goals')
      .update({
        target_operations: 4,
        max_losses: 2,
      })
      .eq('user_id', user_id)
      .eq('date', today);

    if (goalsError) throw goalsError;

    // 3. Retornar configurações atualizadas
    const { data: settings } = await supabase
      .from('user_settings')
      .select('trading_strategy')
      .eq('user_id', user_id)
      .single();

    const { data: goals } = await supabase
      .from('daily_goals')
      .select('*')
      .eq('user_id', user_id)
      .eq('date', today)
      .maybeSingle();

    console.log(`✅ Configuração concluída:`, { settings, goals });

    return new Response(
      JSON.stringify({
        success: true,
        message: '🎯 Estratégia Scalping 1 Minuto ativada com sucesso!',
        settings,
        goals,
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
