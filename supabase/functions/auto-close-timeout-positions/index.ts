import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BINANCE_API_KEY = Deno.env.get('BINANCE_API_KEY');
const BINANCE_API_SECRET = Deno.env.get('BINANCE_API_SECRET');

const TIMEOUT_MINUTES = 210; // 3h30min = 210 minutos

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { user_id } = await req.json();

    console.log('\n================================================================================');
    console.log('⏰ AUTO-CLOSE TIMEOUT - Verificando posições antigas');
    console.log('================================================================================');
    console.log(`👤 User ID: ${user_id || 'ALL'}`);
    console.log(`⏱️ Timeout: ${TIMEOUT_MINUTES} minutos (3h30min)`);

    // Buscar todas as posições ativas (filtrar por user_id se fornecido)
    let query = supabase
      .from('active_positions')
      .select('*');
    
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data: positions, error: posError } = await query;

    if (posError) {
      console.error('❌ Erro ao buscar posições:', posError);
      throw posError;
    }

    if (!positions || positions.length === 0) {
      console.log('✅ Nenhuma posição ativa encontrada');
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Nenhuma posição ativa',
          closed: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Encontradas ${positions.length} posições ativas`);

    const now = new Date();
    const closedPositions: any[] = [];
    const errors: any[] = [];

    for (const position of positions) {
      const openedAt = new Date(position.opened_at);
      const minutesOpen = (now.getTime() - openedAt.getTime()) / (1000 * 60);

      console.log(`\n📍 ${position.asset}:`);
      console.log(`├─ Aberta há: ${minutesOpen.toFixed(0)} minutos (${(minutesOpen / 60).toFixed(1)}h)`);
      console.log(`├─ Direção: ${position.direction}`);
      console.log(`├─ Entry: ${position.entry_price}`);

      // Verificar se ultrapassou o timeout
      console.log(`├─ Timeout configurado: ${TIMEOUT_MINUTES} min (3h30)`);
      console.log(`├─ Tempo restante: ${Math.max(0, TIMEOUT_MINUTES - minutesOpen).toFixed(1)} min`);
      console.log(`└─ Ação: ${minutesOpen >= TIMEOUT_MINUTES ? '🔴 FECHAR AGORA' : '🟢 MANTER'}`);
      
      if (minutesOpen >= TIMEOUT_MINUTES) {
        console.log(`└─ ⏰ TIMEOUT! Fechando automaticamente...`);

        try {
          // Buscar configurações do usuário
          const { data: userSettings, error: settingsError } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', position.user_id)
            .single();

          if (settingsError || !userSettings) {
            console.error('❌ Erro ao buscar configurações do usuário');
            errors.push({
              asset: position.asset,
              error: 'User settings not found'
            });
            continue;
          }

          const paperMode = userSettings.paper_mode === true;
          console.log(`   Modo: ${paperMode ? 'PAPER' : 'REAL'}`);

          // Buscar preço atual na Binance
          let currentPrice = position.current_price; // fallback
          
          try {
            const tickerUrl = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${position.asset}`;
            const tickerResponse = await fetch(tickerUrl);
            const tickerData = await tickerResponse.json();
            currentPrice = parseFloat(tickerData.price);
            console.log(`   Preço atual: ${currentPrice}`);
          } catch (priceError) {
            console.warn('⚠️ Erro ao buscar preço, usando current_price do banco');
          }

          // Calcular PnL
          const entryPrice = position.entry_price;
          const direction = position.direction;
          
          let pnl = 0;
          if (direction === 'BUY') {
            pnl = currentPrice - entryPrice;
          } else if (direction === 'SELL' || direction === 'SHORT') {
            pnl = entryPrice - currentPrice;
          }

          // Normalizar PnL como percentual do risco
          const stopDistance = Math.abs(entryPrice - position.stop_loss);
          const pnlRR = stopDistance > 0 ? pnl / stopDistance : 0;
          
          const result = pnl >= 0 ? 'WIN' : 'LOSS';
          
          console.log(`   PnL: ${pnl.toFixed(4)} (${pnlRR.toFixed(2)}R) → ${result}`);

          // Fechar na Binance (se modo real)
          if (!paperMode && userSettings.api_key && userSettings.api_secret) {
            try {
              console.log('   📤 Enviando ordem de fechamento para Binance...');
              
              // Buscar quantidade atual da posição na Binance
              const timestamp = Date.now();
              const queryString = `timestamp=${timestamp}`;
              
              const encoder = new TextEncoder();
              const keyData = encoder.encode(userSettings.api_secret);
              const messageData = encoder.encode(queryString);
              const cryptoKey = await crypto.subtle.importKey(
                "raw",
                keyData,
                { name: "HMAC", hash: "SHA-256" },
                false,
                ["sign"]
              );
              const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
              const signature = Array.from(new Uint8Array(signatureBuffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

              const positionUrl = `https://fapi.binance.com/fapi/v2/positionRisk?${queryString}&signature=${signature}`;
              const positionResponse = await fetch(positionUrl, {
                headers: {
                  'X-MBX-APIKEY': userSettings.api_key
                }
              });

              const positionsData = await positionResponse.json();
              const binancePosition = positionsData.find((p: any) => p.symbol === position.asset);

              if (binancePosition && parseFloat(binancePosition.positionAmt) !== 0) {
                const positionAmt = Math.abs(parseFloat(binancePosition.positionAmt));
                
                // Determinar lado da ordem de fechamento
                const closeSide = parseFloat(binancePosition.positionAmt) > 0 ? 'SELL' : 'BUY';
                
                // Criar ordem MARKET para fechar
                const orderTimestamp = Date.now();
                const orderParams = new URLSearchParams({
                  symbol: position.asset,
                  side: closeSide,
                  type: 'MARKET',
                  quantity: positionAmt.toString(),
                  reduceOnly: 'true',
                  timestamp: orderTimestamp.toString()
                });

                const orderEncoder = new TextEncoder();
                const orderKeyData = orderEncoder.encode(userSettings.api_secret);
                const orderMessageData = orderEncoder.encode(orderParams.toString());
                const orderCryptoKey = await crypto.subtle.importKey(
                  "raw",
                  orderKeyData,
                  { name: "HMAC", hash: "SHA-256" },
                  false,
                  ["sign"]
                );
                const orderSignatureBuffer = await crypto.subtle.sign("HMAC", orderCryptoKey, orderMessageData);
                const orderSignature = Array.from(new Uint8Array(orderSignatureBuffer))
                  .map(b => b.toString(16).padStart(2, '0'))
                  .join('');

                orderParams.append('signature', orderSignature);

                const orderUrl = `https://fapi.binance.com/fapi/v1/order`;
                const orderResponse = await fetch(orderUrl, {
                  method: 'POST',
                  headers: {
                    'X-MBX-APIKEY': userSettings.api_key,
                    'Content-Type': 'application/x-www-form-urlencoded'
                  },
                  body: orderParams.toString()
                });

                const orderResult = await orderResponse.json();
                
                if (orderResponse.ok) {
                  console.log(`   ✅ Ordem de fechamento executada: ${orderResult.orderId}`);
                } else {
                  console.error(`   ❌ Erro na ordem Binance:`, orderResult);
                }
              } else {
                console.log('   ⚠️ Posição não encontrada na Binance (já fechada?)');
              }
            } catch (binanceError) {
              console.error('   ❌ Erro ao fechar na Binance:', binanceError);
              // Continuar para fechar no banco mesmo se falhar na Binance
            }
          } else {
            console.log('   📝 Modo PAPER - Simulando fechamento');
          }

          // Atualizar operations
          const { data: operation, error: opError } = await supabase
            .from('operations')
            .update({
              result: result,
              exit_price: currentPrice,
              exit_time: now.toISOString(),
              pnl: pnl
            })
            .eq('asset', position.asset)
            .eq('user_id', position.user_id)
            .eq('result', 'OPEN')
            .order('entry_time', { ascending: false })
            .limit(1)
            .select();

          if (opError) {
            console.error('   ❌ Erro ao atualizar operation:', opError);
          } else {
            console.log('   ✅ Operation atualizada');
          }

          // Remover de active_positions
          const { error: deleteError } = await supabase
            .from('active_positions')
            .delete()
            .eq('id', position.id);

          if (deleteError) {
            console.error('   ❌ Erro ao remover posição:', deleteError);
          } else {
            console.log('   ✅ Posição removida de active_positions');
          }

          // Registrar em agent_logs
          await supabase
            .from('agent_logs')
            .insert({
              user_id: position.user_id,
              agent_name: 'TIMEOUT_CLOSER',
              asset: position.asset,
              status: 'CLOSED_TIMEOUT',
              data: {
                reason: `Posição aberta há ${minutesOpen.toFixed(0)} minutos (limite: ${TIMEOUT_MINUTES}min)`,
                duration_minutes: minutesOpen,
                duration_hours: minutesOpen / 60,
                entry_price: entryPrice,
                exit_price: currentPrice,
                pnl: pnl,
                pnl_rr: pnlRR,
                result: result,
                mode: paperMode ? 'PAPER' : 'REAL'
              }
            });

          console.log('   ✅ Log registrado em agent_logs');

          closedPositions.push({
            asset: position.asset,
            duration_minutes: minutesOpen,
            pnl: pnl,
            result: result
          });

        } catch (closeError) {
          console.error(`   ❌ Erro ao fechar ${position.asset}:`, closeError);
          errors.push({
            asset: position.asset,
            error: closeError instanceof Error ? closeError.message : 'Unknown error'
          });
        }
      } else {
        const remainingMinutes = TIMEOUT_MINUTES - minutesOpen;
        console.log(`└─ ✅ OK (faltam ${remainingMinutes.toFixed(0)} min para timeout)`);
      }
    }

    console.log('\n================================================================================');
    console.log(`✅ AUTO-CLOSE CONCLUÍDO`);
    console.log(`├─ Posições fechadas: ${closedPositions.length}`);
    console.log(`└─ Erros: ${errors.length}`);
    console.log('================================================================================\n');

    return new Response(
      JSON.stringify({
        success: true,
        closed: closedPositions.length,
        positions: closedPositions,
        errors: errors
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('❌ ERRO CRÍTICO:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
