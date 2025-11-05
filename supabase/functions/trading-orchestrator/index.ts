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
      
      // Analyze market data and generate trading signals
      const signal = await analyzeMarketAndGenerateSignal(candles, asset, settings);
      
      await supabase.from('agent_logs').insert({
        agent_name: 'Market Analyzer',
        asset: asset,
        status: signal ? 'active' : 'waiting',
        data: { 
          message: signal ? `Signal generated: ${signal.action}` : 'No signal - waiting for setup',
          intervals: Object.keys(candles)
        }
      });

      // Create new position if signal is valid
      if (signal && signal.action !== 'HOLD') {
        const positionSize = (settings.balance * settings.risk_per_trade) / Math.abs(signal.entry_price - signal.stop_loss);
        const projectedProfit = positionSize * Math.abs(signal.take_profit - signal.entry_price);
        
        const { data: newPosition, error: positionError } = await supabase
          .from('active_positions')
          .insert({
            asset: asset,
            direction: signal.action,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            risk_reward: signal.risk_reward,
            current_price: signal.entry_price,
            current_pnl: 0,
            projected_profit: projectedProfit,
            agents: signal.agents,
            session: 'auto'
          })
          .select()
          .single();

        if (positionError) {
          console.error('Error creating position:', positionError);
        } else {
          console.log('New position opened:', newPosition);
          
          // Insert into operations table with 'OPEN' result
          await supabase.from('operations').insert({
            asset: asset,
            direction: signal.action,
            entry_price: signal.entry_price,
            stop_loss: signal.stop_loss,
            take_profit: signal.take_profit,
            risk_reward: signal.risk_reward,
            agents: signal.agents,
            session: 'auto',
            result: 'OPEN'
          });

          results.push({ asset, signal });
        }
      }
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

// Simple technical analysis function
async function analyzeMarketAndGenerateSignal(candles: any, asset: string, settings: any) {
  try {
    const candles5m = candles['5m'];
    const candles15m = candles['15m'];
    const candles1h = candles['1h'];
    
    if (!candles5m || candles5m.length < 20 || !candles1h || candles1h.length < 10) {
      return null;
    }

    const currentPrice = parseFloat(candles5m[candles5m.length - 1].close);
    
    // Calculate Simple Moving Averages
    const sma20_5m = candles5m.slice(-20).reduce((sum: number, c: any) => sum + parseFloat(c.close), 0) / 20;
    const sma50_5m = candles5m.slice(-50).reduce((sum: number, c: any) => sum + parseFloat(c.close), 0) / 50;
    
    // Calculate RSI (14 periods on 5m)
    const rsi = calculateRSI(candles5m.slice(-15).map((c: any) => parseFloat(c.close)));
    
    // Check trend on higher timeframe
    const trend1h = candles1h[candles1h.length - 1].close > candles1h[candles1h.length - 5].close ? 'UP' : 'DOWN';
    
    // Generate signal based on multiple conditions
    let signal = null;
    
    // LONG setup: Price above SMA20, RSI oversold recovering, aligned with 1h trend
    if (currentPrice > sma20_5m && rsi > 30 && rsi < 50 && trend1h === 'UP' && sma20_5m > sma50_5m) {
      const stopLoss = currentPrice * 0.995; // 0.5% stop loss
      const takeProfit = currentPrice * 1.015; // 1.5% take profit (1:3 R:R)
      const riskReward = Math.abs(takeProfit - currentPrice) / Math.abs(currentPrice - stopLoss);
      
      signal = {
        action: 'BUY',
        entry_price: currentPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_reward: riskReward,
        agents: {
          'Trend Analyzer': 'Uptrend confirmed on 1h',
          'RSI Agent': `RSI: ${rsi.toFixed(2)} - Oversold recovery`,
          'MA Agent': 'Price above SMA20, bullish alignment'
        }
      };
    }
    
    // SHORT setup: Price below SMA20, RSI overbought, aligned with 1h trend
    if (currentPrice < sma20_5m && rsi > 50 && rsi < 70 && trend1h === 'DOWN' && sma20_5m < sma50_5m) {
      const stopLoss = currentPrice * 1.005; // 0.5% stop loss
      const takeProfit = currentPrice * 0.985; // 1.5% take profit (1:3 R:R)
      const riskReward = Math.abs(currentPrice - takeProfit) / Math.abs(stopLoss - currentPrice);
      
      signal = {
        action: 'SELL',
        entry_price: currentPrice,
        stop_loss: stopLoss,
        take_profit: takeProfit,
        risk_reward: riskReward,
        agents: {
          'Trend Analyzer': 'Downtrend confirmed on 1h',
          'RSI Agent': `RSI: ${rsi.toFixed(2)} - Overbought correction`,
          'MA Agent': 'Price below SMA20, bearish alignment'
        }
      };
    }
    
    return signal;
  } catch (error) {
    console.error('Error analyzing market:', error);
    return null;
  }
}

// Calculate RSI (Relative Strength Index)
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

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
