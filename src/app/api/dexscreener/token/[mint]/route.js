import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE = new Map();
const CACHE_TTL = 2 * 60 * 1000;

export async function GET(request, { params }) {
  try {
    const { mint } = await params;
    if (!mint || mint.length < 32) {
      return NextResponse.json({ error: 'Invalid mint' }, { status: 400 });
    }

    const cached = CACHE.get(mint);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // Try the latest DexScreener API endpoint format first
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      // Try the latest API format: /latest/dex/tokens/{chainId}/{tokenAddresses}
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/solana/${mint}`,
        {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (compatible; Zeto/1.0)'
          },
          signal: controller.signal,
          cache: 'no-store'
        }
      );
      
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        
        // DexScreener latest API returns { pairs: [...] }
        let pairs = [];
        if (data?.pairs && Array.isArray(data.pairs)) {
          pairs = data.pairs;
        } else if (Array.isArray(data)) {
          pairs = data;
        }
        
        if (pairs.length > 0) {
          const pair = pairs[0];
          const isBase = pair.baseToken?.address?.toLowerCase() === mint.toLowerCase();
          const token = isBase ? pair.baseToken : pair.quoteToken;
          const priceUsd = pair.priceUsd ?? null;
          const priceChange = pair.priceChange?.h24 ?? null;
          const imageUrl = pair.info?.imageUrl ?? pair.baseToken?.info?.imageUrl ?? pair.quoteToken?.info?.imageUrl ?? null;

          const result = {
            priceUsd: priceUsd ? Number(priceUsd) : null,
            priceChange24h: priceChange != null ? Number(priceChange) : null,
            imageUrl,
            symbol: token?.symbol ?? null,
            name: token?.name ?? null,
          };
          
          CACHE.set(mint, { data: result, timestamp: Date.now() });
          return NextResponse.json(result);
        }
      }

      // Fallback to old v1 endpoint if latest doesn't work
      console.log(`Latest API failed, trying v1 endpoint for mint: ${mint}`);
      const v1Controller = new AbortController();
      const v1TimeoutId = setTimeout(() => v1Controller.abort(), 10000);
      
      try {
        const v1Res = await fetch(
          `https://api.dexscreener.com/tokens/v1/solana/${mint}`,
          {
            headers: { 
              'Accept': 'application/json',
              'User-Agent': 'Mozilla/5.0 (compatible; Zeto/1.0)'
            },
            signal: v1Controller.signal,
            cache: 'no-store'
          }
        );
        
        clearTimeout(v1TimeoutId);

        if (v1Res.ok) {
          const v1Data = await v1Res.json();
          
          // Handle different response formats
          let v1Pairs = [];
          if (Array.isArray(v1Data)) {
            v1Pairs = v1Data;
          } else if (v1Data?.pairs && Array.isArray(v1Data.pairs)) {
            v1Pairs = v1Data.pairs;
          } else if (v1Data?.data?.pairs && Array.isArray(v1Data.data.pairs)) {
            v1Pairs = v1Data.data.pairs;
          }
          
          if (v1Pairs.length > 0) {
            const pair = v1Pairs[0];
            const isBase = pair.baseToken?.address?.toLowerCase() === mint.toLowerCase();
            const token = isBase ? pair.baseToken : pair.quoteToken;
            const priceUsd = pair.priceUsd ?? null;
            const priceChange = pair.priceChange?.h24 ?? null;
            const imageUrl = pair.info?.imageUrl ?? pair.baseToken?.info?.imageUrl ?? pair.quoteToken?.info?.imageUrl ?? null;

            const result = {
              priceUsd: priceUsd ? Number(priceUsd) : null,
              priceChange24h: priceChange != null ? Number(priceChange) : null,
              imageUrl,
              symbol: token?.symbol ?? null,
              name: token?.name ?? null,
            };
            
            CACHE.set(mint, { data: result, timestamp: Date.now() });
            return NextResponse.json(result);
          }
        }
      } catch (v1Error) {
        clearTimeout(v1TimeoutId);
        console.error('DexScreener v1 API error:', v1Error);
      }

      // If both endpoints fail, return empty data
      console.warn(`DexScreener API returned non-ok status for mint ${mint}`);
      const empty = { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null };
      CACHE.set(mint, { data: empty, timestamp: Date.now() });
      return NextResponse.json(empty, { status: 200 });
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('DexScreener API timeout for mint:', mint);
      } else {
        console.error('DexScreener API fetch error:', fetchError.message || fetchError);
      }
      throw fetchError;
    }
  } catch (e) {
    console.error('DEXScreener token fetch error:', e.message || e);
    return NextResponse.json(
      { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null },
      { status: 200 }
    );
  }
}
