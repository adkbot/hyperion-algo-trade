// ============================================
// ALERT GENERATOR - Gerador de Alertas Inteligentes
// ============================================
// Monitora eventos e gera alertas automáticos

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

    console.log(`🔔 Gerando alertas para user ${user_id}`);

    const alerts: any[] = [];
    const now = new Date().toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // 1. Verificar taxa alta de STAY_OUT
    const { data: recentHistory, error: historyError } = await supabaseAdmin
      .from('session_history')
      .select('signal')
      .eq('user_id', user_id)
      .gte('timestamp', oneHourAgo);

    if (!historyError && recentHistory && recentHistory.length > 20) {
      const stayOutCount = recentHistory.filter(h => h.signal === 'STAY_OUT').length;
      const stayOutRate = stayOutCount / recentHistory.length;

      if (stayOutRate > 0.90) {
        alerts.push({
          user_id,
          alert_type: 'WARNING',
          category: 'PERFORMANCE',
          title: '⚠️ Sistema Muito Conservador',
          message: `${(stayOutRate * 100).toFixed(1)}% de sinais STAY_OUT na última hora. Considere relaxar os filtros da estratégia.`,
          severity: 2,
          action_required: true,
          action_url: '/settings'
        });
      }
    }

    // 2. Verificar sinais expirados sem execução
    const { data: expiredSignals, error: expiredError } = await supabaseAdmin
      .from('pending_signals')
      .select('id')
      .eq('user_id', user_id)
      .eq('status', 'EXPIRED')
      .gte('created_at', oneHourAgo);

    if (!expiredError && expiredSignals && expiredSignals.length > 5) {
      alerts.push({
        user_id,
        alert_type: 'WARNING',
        category: 'EXECUTION',
        title: '⏰ Sinais Expirando Sem Execução',
        message: `${expiredSignals.length} sinais expiraram na última hora sem serem executados. Verifique a execução automática.`,
        severity: 3,
        action_required: true,
        action_url: '/'
      });
    }

    // 3. Verificar sinais de alta confiança
    const { data: highConfSignals, error: signalsError } = await supabaseAdmin
      .from('pending_signals')
      .select('asset, direction, confidence_score, strategy')
      .eq('user_id', user_id)
      .eq('status', 'PENDING')
      .gte('confidence_score', 90)
      .limit(3);

    if (!signalsError && highConfSignals && highConfSignals.length > 0) {
      for (const signal of highConfSignals) {
        alerts.push({
          user_id,
          alert_type: 'INFO',
          category: 'SIGNAL',
          title: '🎯 Sinal de Alta Confiança',
          message: `${signal.asset} - ${signal.direction} com ${signal.confidence_score}% de confiança detectado (${signal.strategy})`,
          severity: 1,
          action_required: false
        });
      }
    }

    // 4. Verificar perdas consecutivas
    const { data: recentOps, error: opsError } = await supabaseAdmin
      .from('operations')
      .select('result')
      .eq('user_id', user_id)
      .not('result', 'is', null)
      .order('exit_time', { ascending: false })
      .limit(5);

    if (!opsError && recentOps && recentOps.length >= 3) {
      const consecutiveLosses = recentOps.slice(0, 3).every(op => op.result === 'LOSS');
      
      if (consecutiveLosses) {
        alerts.push({
          user_id,
          alert_type: 'ERROR',
          category: 'RISK',
          title: '⚠️ Perdas Consecutivas',
          message: '3 perdas consecutivas detectadas. Sistema entrará em modo conservador automaticamente.',
          severity: 3,
          action_required: true,
          action_url: '/settings'
        });
      }
    }

    // 5. Verificar drawdown
    const today = new Date().toISOString().split('T')[0];
    const { data: todayGoals, error: goalsError } = await supabaseAdmin
      .from('daily_goals')
      .select('total_pnl')
      .eq('user_id', user_id)
      .eq('date', today)
      .single();

    if (!goalsError && todayGoals && todayGoals.total_pnl) {
      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('balance')
        .eq('user_id', user_id)
        .single();

      const balance = settings?.balance || 10000;
      const drawdownPercent = (todayGoals.total_pnl / balance) * 100;

      if (drawdownPercent < -8) {
        alerts.push({
          user_id,
          alert_type: 'WARNING',
          category: 'RISK',
          title: '📉 Drawdown Elevado',
          message: `Drawdown de ${drawdownPercent.toFixed(2)}% hoje. Próximo de pausar automaticamente em -10%.`,
          severity: 3,
          action_required: true,
          action_url: '/settings'
        });
      }
    }

    // 6. Verificar falhas de execução
    const { data: failedOps, error: failedError } = await supabaseAdmin
      .from('agent_logs')
      .select('id')
      .eq('user_id', user_id)
      .eq('agent_name', 'EXECUTION')
      .eq('status', 'error')
      .gte('created_at', oneHourAgo);

    if (!failedError && failedOps && failedOps.length > 2) {
      alerts.push({
        user_id,
        alert_type: 'ERROR',
        category: 'EXECUTION',
        title: '❌ Falhas de Execução',
        message: `${failedOps.length} falhas ao executar ordens na última hora. Verifique API keys e saldo.`,
        severity: 4,
        action_required: true,
        action_url: '/settings'
      });
    }

    // 7. Inserir alertas no banco (evitar duplicatas)
    if (alerts.length > 0) {
      // Verificar alertas similares já existentes (últimas 2 horas)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const { data: existingAlerts } = await supabaseAdmin
        .from('system_alerts')
        .select('title')
        .eq('user_id', user_id)
        .gte('created_at', twoHoursAgo);

      const existingTitles = new Set(existingAlerts?.map(a => a.title) || []);

      // Filtrar apenas alertas novos
      const newAlerts = alerts.filter(alert => !existingTitles.has(alert.title));

      if (newAlerts.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from('system_alerts')
          .insert(newAlerts);

        if (insertError) {
          console.error('❌ Erro ao inserir alertas:', insertError);
        } else {
          console.log(`✅ ${newAlerts.length} novo(s) alerta(s) gerado(s)`);
        }
      } else {
        console.log('ℹ️ Nenhum alerta novo (similares já existem)');
      }
    } else {
      console.log('✅ Nenhum alerta necessário no momento');
    }

    return new Response(
      JSON.stringify({ 
        alerts_generated: alerts.length,
        alerts: alerts.map(a => a.title)
      }),
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
