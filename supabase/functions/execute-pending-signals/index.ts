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

    // 🔵 CORREÇÃO 4: Função de retry com backoff exponencial
    async function retryOperation<T>(
      operation: () => Promise<T>,
      maxRetries: number = 3,
      baseDelay: number = 1000
    ): Promise<T> {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await operation();
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          const delay = baseDelay * Math.pow(2, i);
          console.log(`⏳ Tentativa ${i + 1}/${maxRetries} falhou. Retry em ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      throw new Error('Max retries exceeded');
    }

    for (const signal of pendingSignals) {
      const signalCreatedAt = new Date(signal.created_at).toLocaleString('pt-BR');
      console.log(`\n🔍 [${signalCreatedAt}] Processando sinal ${signal.id} (${signal.asset} ${signal.direction})`);

      // 1. Verificar se posição já existe para este asset
      const { data: existingPosition } = await supabaseAdmin
        .from('active_positions')
        .select('id')
        .eq('user_id', signal.user_id)
        .eq('asset', signal.asset)
        .single();

      if (existingPosition) {
        const reason = `Posição ativa já existe em ${signal.asset}`;
        console.log(`❌ ${reason}`);
        
          // Log detalhado de rejeição com código amigável
          await supabaseAdmin.from('agent_logs').insert({
            agent_name: 'EXECUTE_PENDING_SIGNALS',
            asset: signal.asset,
            status: 'REJECTED',
            user_id: signal.user_id,
            data: {
              signal_id: signal.id,
              reason: 'ACTIVE_POSITION_EXISTS',
              details: reason,
              existing_position_id: existingPosition.id,
              friendly_message: 'Já existe uma posição ativa neste ativo'
            }
          });
        
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

        // 🔵 CORREÇÃO 1: Aumentar tolerância para 5% (cripto é volátil)
        const priceDiff = Math.abs(currentPrice - signal.entry_price) / signal.entry_price;
        
        console.log(`📊 Validação de preço:`);
        console.log(`├─ Entry price: $${signal.entry_price}`);
        console.log(`├─ Current price: $${currentPrice}`);
        console.log(`├─ Diferença: ${(priceDiff * 100).toFixed(2)}%`);
        console.log(`└─ Status: ${priceDiff > 0.05 ? '❌ REJEITADO (>5%)' : '✅ ACEITO (<5%)'}`);
        
        if (priceDiff > 0.05) {
          const reason = `Preço atual (${currentPrice}) fora da tolerância (±5%) do entry (${signal.entry_price})`;
          console.log(`❌ ${reason}`);
          
          // Log detalhado de rejeição
          await supabaseAdmin.from('agent_logs').insert({
            agent_name: 'EXECUTE_PENDING_SIGNALS',
            asset: signal.asset,
            status: 'REJECTED',
            user_id: signal.user_id,
            data: {
              signal_id: signal.id,
              reason: 'PRICE_DEVIATION_TOO_HIGH',
              details: reason,
              entry_price: signal.entry_price,
              current_price: currentPrice,
              deviation_percent: (priceDiff * 100).toFixed(2),
              tolerance_percent: 5.0
            }
          });
          
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
          const reason = 'Configurações do usuário não encontradas';
          console.log(`❌ ${reason}`);
          
          // Log detalhado de rejeição
          await supabaseAdmin.from('agent_logs').insert({
            agent_name: 'EXECUTE_PENDING_SIGNALS',
            asset: signal.asset,
            status: 'REJECTED',
            user_id: signal.user_id,
            data: {
              signal_id: signal.id,
              reason: 'USER_SETTINGS_NOT_FOUND',
              details: reason
            }
          });
          
          rejected++;
          continue;
        }

        // 5. Verificar limite de posições
        const { data: activePositions } = await supabaseAdmin
          .from('active_positions')
          .select('id')
          .eq('user_id', signal.user_id);

        if (activePositions && activePositions.length >= (settings.max_positions || 3)) {
          const reason = `Limite de posições atingido (${activePositions.length}/${settings.max_positions})`;
          console.log(`❌ ${reason}`);
          
          // Log detalhado de rejeição
          await supabaseAdmin.from('agent_logs').insert({
            agent_name: 'EXECUTE_PENDING_SIGNALS',
            asset: signal.asset,
            status: 'REJECTED',
            user_id: signal.user_id,
            data: {
              signal_id: signal.id,
              reason: 'MAX_POSITIONS_REACHED',
              details: reason,
              current_positions: activePositions.length,
              max_positions: settings.max_positions || 3
            }
          });
          
          await supabaseAdmin
            .from('pending_signals')
            .update({ status: 'REJECTED', updated_at: now })
            .eq('id', signal.id);
          
          rejected++;
          continue;
        }

        // 🔵 CORREÇÃO 4: Executar ordem com retry logic
        console.log(`\n🎯 EXECUTANDO ORDEM VIA BINANCE-ORDER (COM RETRY)...`);
        console.log(`├─ User: ${signal.user_id}`);
        console.log(`├─ Asset: ${signal.asset}`);
        console.log(`├─ Direction: ${signal.direction}`);
        console.log(`├─ Entry: $${signal.entry_price}`);
        console.log(`├─ Stop: $${signal.stop_loss}`);
        console.log(`├─ TP: $${signal.take_profit}`);
        console.log(`└─ Paper Mode: ${settings.paper_mode ? '📝 SIM' : '💰 NÃO (REAL)'}`);
        
        try {
          const orderResult = await retryOperation(async () => {
            const { data, error } = await supabaseAdmin.functions.invoke('binance-order', {
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
            if (error) throw error;
            return data;
          }, 3, 1000);

          if (!orderResult) {
            const reason = `Erro ao executar ordem após 3 tentativas`;
            console.error(`❌ ${reason}`);
            
            // Log detalhado de erro
            await supabaseAdmin.from('agent_logs').insert({
              agent_name: 'EXECUTE_PENDING_SIGNALS',
              asset: signal.asset,
              status: 'ERROR',
              user_id: signal.user_id,
              data: {
                signal_id: signal.id,
                reason: 'BINANCE_ORDER_ERROR',
                details: reason,
                retries: 3
              }
            });
            
            await supabaseAdmin
              .from('pending_signals')
              .update({ status: 'REJECTED', updated_at: now })
              .eq('id', signal.id);
            
            rejected++;
            continue;
          }

          // ✅ CORREÇÃO CRÍTICA: Só marcar como EXECUTED se binance-order confirmou sucesso
          if (!orderResult?.success || !orderResult?.operation_id) {
            const reason = 'binance-order não retornou sucesso ou operation_id';
            console.error(`❌ ${reason}`);
            console.error('   orderResult:', orderResult);
            
            await supabaseAdmin.from('agent_logs').insert({
              agent_name: 'EXECUTE_PENDING_SIGNALS',
              asset: signal.asset,
              status: 'REJECTED',
              user_id: signal.user_id,
              data: {
                signal_id: signal.id,
                reason: 'ORDER_EXECUTION_FAILED',
                details: reason,
                order_result: orderResult
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
          console.log(`   operation_id: ${orderResult.operation_id}`);
          console.log(`   Result:`, JSON.stringify(orderResult, null, 2));
          
          // 7. Atualizar status do sinal (só se chegou aqui = sucesso confirmado)
          await supabaseAdmin
            .from('pending_signals')
            .update({ 
              status: 'EXECUTED', 
              executed_at: now,
              updated_at: now 
            })
            .eq('id', signal.id);

          // 8. Logar execução bem-sucedida
          await supabaseAdmin.from('agent_logs').insert({
            agent_name: 'EXECUTE_PENDING_SIGNALS',
            asset: signal.asset,
            status: 'SUCCESS',
            user_id: signal.user_id,
            data: {
              signal_id: signal.id,
              operation_id: orderResult.operation_id,
              entry_price: signal.entry_price,
              current_price: currentPrice,
              strategy: signal.strategy,
              confidence: signal.confidence_score,
              paper_mode: settings.paper_mode,
              order_result: orderResult
            }
          });

          console.log(`✅ Sinal ${signal.id} executado com sucesso!`);
          console.log(`   ✅ operation_id: ${orderResult.operation_id}`);
          console.log(`   ✅ active_positions: criado pelo binance-order`);
          console.log(`   ✅ operations: criado pelo binance-order`);
          console.log(`   ✅ pending_signals: marcado como EXECUTED`);
          console.log(`   ✅ agent_logs: registrado\n`);
          
          executed++;
          
        } catch (binanceError: any) {
          const errorMsg = binanceError.message || 'Erro desconhecido';
          let errorReason = 'BINANCE_ORDER_EXCEPTION';
          let friendlyMessage = 'Erro ao executar ordem na Binance';

          // Detectar erros específicos da Binance
          if (errorMsg.includes('Invalid API-key') || errorMsg.includes('-2015')) {
            errorReason = 'BINANCE_INVALID_API_KEY';
            friendlyMessage = 'API Key inválida ou sem permissão. Verifique: Enable Futures, Enable Trading e IP Whitelist';
          } else if (errorMsg.includes('IP') || errorMsg.includes('permissions')) {
            errorReason = 'BINANCE_IP_NOT_ALLOWED';
            friendlyMessage = 'IP não autorizado. Configure IP Whitelist como UNRESTRICTED na Binance';
          } else if (errorMsg.includes('Futures')) {
            errorReason = 'BINANCE_MISSING_FUTURES_PERMISSION';
            friendlyMessage = 'Permissão "Enable Futures" não habilitada na Binance';
          }

          const reason = `${friendlyMessage}: ${errorMsg}`;
          console.error(`❌ ${reason}`);
          
          await supabaseAdmin.from('agent_logs').insert({
            agent_name: 'EXECUTE_PENDING_SIGNALS',
            asset: signal.asset,
            status: 'ERROR',
            user_id: signal.user_id,
            data: {
              signal_id: signal.id,
              reason: errorReason,
              details: reason,
              friendly_message: friendlyMessage,
              error: binanceError
            }
          });
          
          rejected++;
          continue;
        }

      } catch (priceError) {
        const errorMessage = priceError instanceof Error ? priceError.message : 'Erro desconhecido';
        console.error(`❌ Erro ao buscar preço:`, priceError);
        
        // Log detalhado de erro
        await supabaseAdmin.from('agent_logs').insert({
          agent_name: 'EXECUTE_PENDING_SIGNALS',
          asset: signal.asset,
          status: 'ERROR',
          user_id: signal.user_id,
          data: {
            signal_id: signal.id,
            reason: 'PRICE_FETCH_ERROR',
            details: `Erro ao buscar preço do mercado: ${errorMessage}`,
            error: priceError
          }
        });
        
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
