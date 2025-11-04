import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols = ['btcusdt', 'ethusdt', 'bnbusdt'] } = await req.json().catch(() => ({}));
    
    console.log('Starting Binance WebSocket for symbols:', symbols);

    // Create streams for multiple timeframes
    const streams = symbols.flatMap((s: string) => [
      `${s}@kline_1m`,
      `${s}@kline_5m`,
      `${s}@kline_15m`,
      `${s}@kline_1h`,
      `${s}@kline_4h`,
    ]);

    const BINANCE_WS_URL = `wss://fstream.binance.com/stream?streams=${streams.join('/')}`;
    
    // Return Server-Sent Events stream
    const stream = new ReadableStream({
      start(controller) {
        const ws = new WebSocket(BINANCE_WS_URL);
        
        ws.onopen = () => {
          console.log('WebSocket connected to Binance');
          controller.enqueue(`data: ${JSON.stringify({ type: 'connected', symbols })}\n\n`);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            
            if (data.data && data.data.k) {
              const kline = data.data.k;
              const candle = {
                symbol: kline.s,
                interval: kline.i,
                openTime: kline.t,
                closeTime: kline.T,
                open: parseFloat(kline.o),
                high: parseFloat(kline.h),
                low: parseFloat(kline.l),
                close: parseFloat(kline.c),
                volume: parseFloat(kline.v),
                isClosed: kline.x,
              };
              
              controller.enqueue(`data: ${JSON.stringify(candle)}\n\n`);
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          controller.enqueue(`data: ${JSON.stringify({ type: 'error', message: 'WebSocket error' })}\n\n`);
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          controller.enqueue(`data: ${JSON.stringify({ type: 'closed' })}\n\n`);
          controller.close();
        };

        // Cleanup on client disconnect
        req.signal.addEventListener('abort', () => {
          ws.close();
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Error in binance-websocket:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
