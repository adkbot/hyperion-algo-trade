import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const WINDMILL_TOKEN = Deno.env.get('WINDMILL_TOKEN');
const WINDMILL_URL = Deno.env.get('WINDMILL_WORKSPACE_URL');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Check bot status
    const { data: settings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to fetch settings');
    }

    if (settings.bot_status !== 'running') {
      return new Response(
        JSON.stringify({ message: 'Bot is not running', status: settings.bot_status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Bot is running, starting analysis...');

    // 2. Get daily goals
    const { data: dailyGoal } = await supabase
      .from('daily_goals')
      .select('*')
      .eq('date', new Date().toISOString().split('T')[0])
      .single();

    // Check if max losses reached
    if (dailyGoal && dailyGoal.losses >= dailyGoal.max_losses) {
      console.log('Max losses reached for today, stopping bot');
      
      await supabase
        .from('user_settings')
        .update({ bot_status: 'stopped' })
        .eq('id', settings.id);

      return new Response(
        JSON.stringify({ message: 'Max losses reached, bot stopped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Check active positions count
    const { data: activePositions } = await supabase
      .from('active_positions')
      .select('*');

    if (activePositions && activePositions.length >= settings.max_positions) {
      console.log('Max positions reached');
      return new Response(
        JSON.stringify({ message: 'Max positions reached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Fetch candles from Binance for analysis
    const assets = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT'];
    const results: Array<{ asset: string; signal: any }> = [];

    for (const asset of assets) {
      // Skip if already have position on this asset
      if (activePositions?.some(p => p.asset === asset)) {
        console.log(`Skipping ${asset} - already have position`);
        continue;
      }

      console.log(`Analyzing ${asset}...`);

      // Fetch candles from Binance
      const candles = await fetchCandlesFromBinance(asset);
      
      // TODO: Call Windmill workflow when ready
      // For now, just log
      console.log(`Fetched ${candles.length} candles for ${asset}`);

      // Log agent activity
      await supabase
        .from('agent_logs')
        .insert({
          agent_name: 'TradingOrchestrator',
          asset,
          status: 'ANALYZING',
          data: { candleCount: candles.length },
        });

      /* 
      // This will be enabled in Phase 2 when Windmill agents are ready
      if (WINDMILL_TOKEN && WINDMILL_URL) {
        const windmillResult = await fetch(`${WINDMILL_URL}/api/w/trading-orchestrator/jobs/run/f/u/admin/trading-orchestrator`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${WINDMILL_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            asset, 
            candles, 
            balance: settings.balance 
          })
        });

        if (windmillResult.ok) {
          const signal = await windmillResult.json();
          
          if (signal.signal === 'ENTRY' && signal.rr >= 3) {
            // Execute order via binance-order function
            results.push({ asset, signal });
          }
        }
      }
      */
    }

    // 5. Monitor and update active positions
    if (activePositions && activePositions.length > 0) {
      await monitorActivePositions(supabase, activePositions);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Analysis cycle completed',
        analyzedAssets: assets.length,
        activePositions: activePositions?.length || 0,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in trading-orchestrator:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function fetchCandlesFromBinance(symbol: string) {
  const intervals = ['1m', '5m', '15m', '1h', '4h'];
  const allCandles: any = {};

  for (const interval of intervals) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=100`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Failed to fetch ${interval} candles for ${symbol}`);
      continue;
    }

    const data = await response.json();
    allCandles[interval] = data.map((k: any) => ({
      openTime: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      closeTime: k[6],
    }));
  }

  return allCandles;
}

async function monitorActivePositions(supabase: any, positions: any[]) {
  for (const position of positions) {
    try {
      // Fetch current price
      const url = `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${position.asset}`;
      const response = await fetch(url);
      const data = await response.json();
      const currentPrice = parseFloat(data.price);

      // Calculate P&L
      const priceDiff = position.direction === 'BUY' 
        ? currentPrice - position.entry_price
        : position.entry_price - currentPrice;
      
      const rMultiple = priceDiff / Math.abs(position.entry_price - position.stop_loss);
      const currentPnl = priceDiff * 100; // Simplified, should use actual quantity

      // Update position
      await supabase
        .from('active_positions')
        .update({ 
          current_price: currentPrice,
          current_pnl: currentPnl 
        })
        .eq('id', position.id);

      // Check for TP/SL hit
      const tpHit = position.direction === 'BUY' 
        ? currentPrice >= position.take_profit
        : currentPrice <= position.take_profit;
      
      const slHit = position.direction === 'BUY'
        ? currentPrice <= position.stop_loss
        : currentPrice >= position.stop_loss;

      if (tpHit || slHit) {
        const result = tpHit ? 'WIN' : 'LOSS';
        console.log(`Position ${position.asset} closed: ${result}`);

        // Close position
        await supabase
          .from('active_positions')
          .delete()
          .eq('id', position.id);

        // Update operation
        await supabase
          .from('operations')
          .update({
            exit_price: currentPrice,
            exit_time: new Date().toISOString(),
            result,
            pnl: currentPnl,
          })
          .eq('asset', position.asset)
          .eq('result', 'OPEN');

        // Update daily goals
        const today = new Date().toISOString().split('T')[0];
        const { data: goal } = await supabase
          .from('daily_goals')
          .select('*')
          .eq('date', today)
          .single();

        if (goal) {
          await supabase
            .from('daily_goals')
            .update({
              total_operations: goal.total_operations + 1,
              wins: result === 'WIN' ? goal.wins + 1 : goal.wins,
              losses: result === 'LOSS' ? goal.losses + 1 : goal.losses,
              total_pnl: goal.total_pnl + currentPnl,
            })
            .eq('date', today);
        }
      }
      // Move SL to BE if +1R
      else if (rMultiple >= 1 && Math.abs(position.stop_loss - position.entry_price) > 0.01) {
        console.log(`Moving SL to BE for ${position.asset}`);
        await supabase
          .from('active_positions')
          .update({ stop_loss: position.entry_price })
          .eq('id', position.id);
      }
    } catch (error) {
      console.error(`Error monitoring position ${position.asset}:`, error);
    }
  }
}
