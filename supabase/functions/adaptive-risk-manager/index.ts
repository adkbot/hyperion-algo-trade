// ============================================
// ADAPTIVE RISK MANAGER - Gestão de Risco Adaptativa
// ============================================
// Ajusta parâmetros de risco baseado em performance

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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`📊 Analisando risco adaptativo para user ${user_id}`);

    // 1. Buscar últimas 5 operações
    const { data: recentOps, error: opsError } = await supabaseAdmin
      .from('operations')
      .select('result, pnl, exit_time')
      .eq('user_id', user_id)
      .not('result', 'is', null)
      .order('exit_time', { ascending: false })
      .limit(5);

    if (opsError) throw opsError;

    // 2. Calcular métricas
    const wins = recentOps?.filter(op => op.result === 'WIN').length || 0;
    const losses = recentOps?.filter(op => op.result === 'LOSS').length || 0;
    const total = recentOps?.length || 0;
    const winRate = total > 0 ? wins / total : 0;

    // 3. Calcular consecutive wins/losses
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    
    if (recentOps && recentOps.length > 0) {
      const lastResult = recentOps[0].result;
      
      for (const op of recentOps) {
        if (op.result === lastResult) {
          if (op.result === 'WIN') consecutiveWins++;
          if (op.result === 'LOSS') consecutiveLosses++;
        } else {
          break;
        }
      }
    }

    // 4. Calcular drawdown diário
    const today = new Date().toISOString().split('T')[0];
    const { data: todayGoals } = await supabaseAdmin
      .from('daily_goals')
      .select('total_pnl')
      .eq('user_id', user_id)
      .eq('date', today)
      .single();

    const dailyPnl = todayGoals?.total_pnl || 0;
    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('balance')
      .eq('user_id', user_id)
      .single();

    const balance = settings?.balance || 10000;
    const dailyDrawdown = Math.min(0, dailyPnl / balance);

    console.log(`📈 Métricas atuais:`);
    console.log(`   Win Rate (últimas 5): ${(winRate * 100).toFixed(1)}%`);
    console.log(`   Wins consecutivos: ${consecutiveWins}`);
    console.log(`   Losses consecutivos: ${consecutiveLosses}`);
    console.log(`   Drawdown diário: ${(dailyDrawdown * 100).toFixed(2)}%`);

    // 5. Determinar ajustes
    let riskMultiplier = 1.0;
    let mode = 'NORMAL';
    let cooldownUntil = null;

    // REGRA 1: Win Rate baixo = Reduzir risco
    if (winRate < 0.40 && total >= 5) {
      riskMultiplier = 0.5;
      mode = 'CONSERVATIVE';
      console.log('⚠️ Win rate baixo - Reduzindo risco para 50%');
    }

    // REGRA 2: 3+ perdas consecutivas = Modo conservador
    if (consecutiveLosses >= 3) {
      riskMultiplier = 0.5;
      mode = 'CONSERVATIVE';
      console.log('⚠️ 3+ perdas consecutivas - Modo conservador ativado');
    }

    // REGRA 3: Drawdown > 10% = PAUSAR
    if (dailyDrawdown < -0.10) {
      riskMultiplier = 0.0;
      mode = 'PAUSED';
      cooldownUntil = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(); // 4 horas
      console.log('🚨 Drawdown crítico - Sistema pausado por 4 horas');

      // Criar alerta
      await supabaseAdmin
        .from('system_alerts')
        .insert({
          user_id,
          alert_type: 'ERROR',
          category: 'RISK',
          title: '🚨 Drawdown Crítico',
          message: `Drawdown de ${(dailyDrawdown * 100).toFixed(2)}% detectado. Bot pausado automaticamente por 4 horas.`,
          severity: 4,
          action_required: true,
          action_url: '/settings'
        });
    }

    // REGRA 4: Recuperação - 2+ wins consecutivos
    if (consecutiveWins >= 2 && mode === 'CONSERVATIVE') {
      riskMultiplier = 1.0;
      mode = 'NORMAL';
      console.log('✅ Recuperação detectada - Voltando ao modo normal');
    }

    // 6. Salvar/Atualizar estado
    const { error: upsertError } = await supabaseAdmin
      .from('risk_management_state')
      .upsert({
        user_id,
        current_risk_multiplier: riskMultiplier,
        consecutive_losses: consecutiveLosses,
        consecutive_wins: consecutiveWins,
        last_5_ops_winrate: winRate,
        daily_drawdown_percent: dailyDrawdown,
        mode,
        cooldown_until: cooldownUntil,
        last_trade_at: recentOps && recentOps.length > 0 ? recentOps[0].exit_time : null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (upsertError) throw upsertError;

    // 7. Atualizar cooldown no user_settings se necessário
    if (cooldownUntil) {
      await supabaseAdmin
        .from('user_settings')
        .update({ 
          cooldown_disabled_until: cooldownUntil,
          bot_status: 'paused'
        })
        .eq('user_id', user_id);
    }

    const result = {
      mode,
      risk_multiplier: riskMultiplier,
      consecutive_wins: consecutiveWins,
      consecutive_losses: consecutiveLosses,
      win_rate: winRate,
      daily_drawdown: dailyDrawdown,
      cooldown_until: cooldownUntil,
      adjustments_made: mode !== 'NORMAL' || riskMultiplier !== 1.0
    };

    console.log('✅ Análise de risco concluída:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
