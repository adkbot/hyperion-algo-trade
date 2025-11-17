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

    console.log(`🎯 Atualizando daily goals para ${today}, user: ${user.id}`);

    // Buscar daily_goals de hoje
    const { data: existingGoal } = await supabaseClient
      .from('daily_goals')
      .select('*')
      .eq('user_id', user.id)
      .eq('date', today)
      .single();

    if (existingGoal) {
      // Atualizar existente
      const { data, error } = await supabaseClient
        .from('daily_goals')
        .update({
          target_operations: 4,
          target_pnl_percent: 12.0,
          max_losses: 2
        })
        .eq('id', existingGoal.id)
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Daily goals atualizados para ${today}:`, data);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Daily goals atualizados com sucesso',
          data 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Criar novo
      const { data, error } = await supabaseClient
        .from('daily_goals')
        .insert({
          user_id: user.id,
          date: today,
          target_operations: 4,
          target_pnl_percent: 12.0,
          max_losses: 2,
          total_operations: 0,
          wins: 0,
          losses: 0,
          total_pnl: 0,
          completed: false
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`✅ Daily goals criados para ${today}:`, data);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Daily goals criados com sucesso',
          data 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('❌ Erro ao atualizar daily goals:', error);
    console.error('❌ Error type:', typeof error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    
    let errorMessage = 'Erro desconhecido';
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    } else if (typeof error === 'string') {
      errorMessage = error;
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
