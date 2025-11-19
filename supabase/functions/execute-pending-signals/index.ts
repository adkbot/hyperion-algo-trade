// ============================================
// EXECUTE PENDING SIGNALS - Executor Automático
// ============================================
// Executa sinais pendentes que ainda estão válidos

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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Buscar sinais pendentes que ainda não expiraram
    const now = new Date().toISOString();
    const { data: pendingSignals, error: fetchError } = await supabaseAdmin
      .from('pending_signals')
      .select('*')
      .eq('status', 'PENDING')
      .gt('expires_at', now)
      .order('confidence_score', { ascending: false })
      .limit(10);

    if (fetchError) throw fetchError;

    if (!pendingSignals || pendingSignals.length === 0) {
      return new Response(
        JSON.stringify({ 
          executed: 0, 
          rejected: 0, 
          expired: 0,
          message: 'Nenhum sinal pendente para executar' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📋 ${pendingSignals.length} sinal(is) pendente(s) encontrado(s)`);

    let executed = 0;
    let rejected = 0;
    let expired = 0;

    for (const signal of pendingSignals) {
      console.log(`\n🔍 Processando sinal ${signal.id} (${signal.asset} ${signal.direction})`);

      // 1. Verificar se posição já existe para este asset
      const { data: existingPosition } = await supabaseAdmin
        .from('active_positions')
        .select('id')
        .eq('user_id', signal.user_id)
        .eq('asset', signal.asset)
        .single();

      if (existingPosition) {
        console.log(`❌ Já existe posição ativa em ${signal.asset}`);
        await supabaseAdmin
          .from('pending_signals')
          .update({ status: 'REJECTED', updated_at: now })
          .eq('id', signal.id);
        
        rejected++;
        continue;
      }

      // 2. Buscar preço atual
      try {
        const tickerUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${signal.asset}`;
        const tickerResponse = await fetch(tickerUrl);
        const tickerData = await tickerResponse.json();
        const currentPrice = parseFloat(tickerData.price);

        // 3. Validar se preço ainda está próximo do entry_price (±0.5%)
        const priceDiff = Math.abs(currentPrice - signal.entry_price) / signal.entry_price;
        if (priceDiff > 0.005) {
          console.log(`❌ Preço atual (${currentPrice}) muito distante do entry (${signal.entry_price})`);
          await supabaseAdmin
            .from('pending_signals')
            .update({ status: 'REJECTED', updated_at: now })
            .eq('id', signal.id);
          
          rejected++;
          continue;
        }

        // 4. Buscar configurações do usuário
        const { data: settings } = await supabaseAdmin
          .from('user_settings')
          .select('*')
          .eq('user_id', signal.user_id)
          .single();

        if (!settings) {
          console.log(`❌ Configurações do usuário não encontradas`);
          rejected++;
          continue;
        }

        // 5. Verificar limite de posições
        const { data: activePositions } = await supabaseAdmin
          .from('active_positions')
          .select('id')
          .eq('user_id', signal.user_id);

        if (activePositions && activePositions.length >= (settings.max_positions || 3)) {
          console.log(`❌ Limite de posições atingido (${activePositions.length}/${settings.max_positions})`);
          await supabaseAdmin
            .from('pending_signals')
            .update({ status: 'REJECTED', updated_at: now })
            .eq('id', signal.id);
          
          rejected++;
          continue;
        }

        // 6. Executar ordem na Binance (se não estiver em paper mode)
        let binanceOrderId = null;
        if (!settings.paper_mode && settings.api_key && settings.api_secret) {
          try {
            console.log(`📤 Executando ordem na Binance...`);
            const { data: orderResult, error: orderError } = await supabaseAdmin.functions.invoke('binance-order', {
              body: {
                user_id: signal.user_id,
                asset: signal.asset,
                direction: signal.direction,
                entry_price: signal.entry_price,
                stop_loss: signal.stop_loss,
                take_profit: signal.take_profit,
                risk_reward: signal.risk_reward,
                session: signal.session,
                strategy: signal.strategy,
                agents: signal.agents
              }
            });

            if (orderError) {
              console.error('❌ Erro ao executar ordem:', orderError);
              await supabaseAdmin
                .from('pending_signals')
                .update({ status: 'REJECTED', updated_at: now })
                .eq('id', signal.id);
              
              rejected++;
              continue;
            }

            binanceOrderId = orderResult?.orderId;
            console.log(`✅ Ordem executada na Binance: ${binanceOrderId}`);
          } catch (binanceError) {
            console.error('❌ Erro Binance:', binanceError);
            rejected++;
            continue;
          }
        } else {
          console.log(`📝 Modo Paper - Simulando execução`);
        }

        // 7. Criar posição ativa
        const { error: insertError } = await supabaseAdmin
          .from('active_positions')
          .insert({
            user_id: signal.user_id,
            asset: signal.asset,
            direction: signal.direction,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            risk_reward: signal.risk_reward,
            session: signal.session,
            agents: signal.agents,
            current_price: currentPrice,
            current_pnl: 0,
            projected_profit: Math.abs(signal.take_profit - signal.entry_price) * (settings.balance * (settings.risk_per_trade || 0.06)) / Math.abs(signal.entry_price - signal.stop_loss)
          });

        if (insertError) {
          console.error('❌ Erro ao criar posição:', insertError);
          rejected++;
          continue;
        }

        // 8. Atualizar status do sinal
        await supabaseAdmin
          .from('pending_signals')
          .update({ 
            status: 'EXECUTED', 
            executed_at: now,
            updated_at: now 
          })
          .eq('id', signal.id);

        // 9. Logar execução
        await supabaseAdmin
          .from('agent_logs')
          .insert({
            user_id: signal.user_id,
            agent_name: 'SIGNAL_EXECUTOR',
            asset: signal.asset,
            status: 'success',
            data: {
              signal_id: signal.id,
              entry_price: signal.entry_price,
              current_price: currentPrice,
              binance_order_id: binanceOrderId,
              strategy: signal.strategy,
              confidence: signal.confidence_score
            }
          });

        console.log(`✅ Sinal executado com sucesso!`);
        executed++;

      } catch (priceError) {
        console.error(`❌ Erro ao buscar preço:`, priceError);
        rejected++;
      }
    }

    // Marcar sinais expirados
    const { error: expireError } = await supabaseAdmin
      .from('pending_signals')
      .update({ status: 'EXPIRED', updated_at: now })
      .eq('status', 'PENDING')
      .lt('expires_at', now);

    if (expireError) {
      console.error('❌ Erro ao marcar expirados:', expireError);
    }

    const summary = {
      executed,
      rejected,
      expired,
      total: pendingSignals.length,
      message: `✅ ${executed} executado(s), ❌ ${rejected} rejeitado(s)`
    };

    console.log('\n📊 RESUMO DA EXECUÇÃO:', summary);

    return new Response(
      JSON.stringify(summary),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Erro:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
