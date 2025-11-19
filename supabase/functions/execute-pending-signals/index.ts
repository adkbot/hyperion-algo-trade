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

        // 6. Executar ordem via binance-order
        console.log(`\n🎯 EXECUTANDO ORDEM VIA BINANCE-ORDER...`);
        console.log(`├─ User: ${signal.user_id}`);
        console.log(`├─ Asset: ${signal.asset}`);
        console.log(`├─ Direction: ${signal.direction}`);
        console.log(`├─ Entry: $${signal.entry_price}`);
        console.log(`├─ Stop: $${signal.stop_loss}`);
        console.log(`├─ TP: $${signal.take_profit}`);
        console.log(`└─ Paper Mode: ${settings.paper_mode ? '📝 SIM' : '💰 NÃO (REAL)'}`);
        
        try {
          const { data: orderResult, error: orderError } = await supabaseAdmin.functions.invoke('binance-order', {
            body: {
              user_id: signal.user_id,
              asset: signal.asset,
              direction: signal.direction,
              price: signal.entry_price,
              quantity: null,  // Será calculado pelo binance-order
              stopLoss: signal.stop_loss,
              takeProfit: signal.take_profit,
              riskReward: signal.risk_reward,
              session: signal.session,
              agents: signal.agents
            }
          });

          if (orderError) {
            console.error('❌ Erro retornado pelo binance-order:', orderError);
            
            // Log do erro em agent_logs
            await supabaseAdmin
              .from('agent_logs')
              .insert({
                user_id: signal.user_id,
                agent_name: 'SIGNAL_EXECUTOR',
                asset: signal.asset,
                status: 'error',
                data: {
                  error: orderError.message || 'Unknown error',
                  signal_id: signal.id,
                  entry_price: signal.entry_price
                }
              });
            
            await supabaseAdmin
              .from('pending_signals')
              .update({ status: 'REJECTED', updated_at: now })
              .eq('id', signal.id);
            
            rejected++;
            continue;
          }

          if (!orderResult?.success) {
            console.error('❌ binance-order retornou success=false:', orderResult);
            
            await supabaseAdmin
              .from('agent_logs')
              .insert({
                user_id: signal.user_id,
                agent_name: 'SIGNAL_EXECUTOR',
                asset: signal.asset,
                status: 'error',
                data: {
                  error: 'Order execution failed',
                  result: orderResult,
                  signal_id: signal.id
                }
              });
            
            await supabaseAdmin
              .from('pending_signals')
              .update({ status: 'REJECTED', updated_at: now })
              .eq('id', signal.id);
            
            rejected++;
            continue;
          }

          console.log(`✅ binance-order executado com sucesso!`);
          console.log(`   Result:`, JSON.stringify(orderResult, null, 2));
          
        } catch (binanceError: any) {
          console.error('❌ Exceção ao chamar binance-order:', binanceError);
          
          await supabaseAdmin
            .from('agent_logs')
            .insert({
              user_id: signal.user_id,
              agent_name: 'SIGNAL_EXECUTOR',
              asset: signal.asset,
              status: 'error',
              data: {
                error: binanceError.message || 'Exception during order execution',
                signal_id: signal.id
              }
            });
          
          rejected++;
          continue;
        }

        // 7. Atualizar status do sinal
        await supabaseAdmin
          .from('pending_signals')
          .update({ 
            status: 'EXECUTED', 
            executed_at: now,
            updated_at: now 
          })
          .eq('id', signal.id);

        // 8. Logar execução bem-sucedida
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
              strategy: signal.strategy,
              confidence: signal.confidence_score,
              paper_mode: settings.paper_mode
            }
          });

        console.log(`✅ Sinal ${signal.id} executado com sucesso!`);
        console.log(`   ✅ active_positions: criado pelo binance-order`);
        console.log(`   ✅ operations: criado pelo binance-order`);
        console.log(`   ✅ pending_signals: marcado como EXECUTED`);
        console.log(`   ✅ agent_logs: registrado\n`);
        
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
