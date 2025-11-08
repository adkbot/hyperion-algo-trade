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
    const { user_id } = await req.json();

    if (!user_id) {
      throw new Error('user_id is required');
    }

    console.log(`🗑️ Clearing history for user: ${user_id}`);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete all historical data for user
    const deletions = await Promise.all([
      supabase.from('session_history').delete().eq('user_id', user_id),
      supabase.from('operations').delete().eq('user_id', user_id),
      supabase.from('active_positions').delete().eq('user_id', user_id),
      supabase.from('agent_logs').delete().eq('user_id', user_id),
      supabase.from('daily_goals').delete().eq('user_id', user_id),
      supabase.from('session_state').delete().eq('user_id', user_id),
    ]);

    const errors = deletions.filter(d => d.error);
    if (errors.length > 0) {
      console.error('Errors during deletion:', errors);
      throw new Error('Failed to clear some data');
    }

    console.log('✅ History cleared successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Histórico limpo com sucesso',
        cleared: {
          session_history: true,
          operations: true,
          active_positions: true,
          agent_logs: true,
          daily_goals: true,
          session_state: true,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error clearing history:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
