import { NextResponse } from 'next/server';

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CACHE = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * GET /api/dexscreener/token/[mint]
 * Fetches token price, price change, and image from DEXScreener.
 * @see https://docs.dexscreener.com/api/reference
 */
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

    // Fetch from DexScreener API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const res = await fetch(
        `https://api.dexscreener.com/tokens/v1/solana/${mint}`,
        {
          headers: { 
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0'
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        console.warn(`DexScreener API returned status ${res.status} for mint ${mint}`);
        const empty = { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null };
        CACHE.set(mint, { data: empty, timestamp: Date.now() });
        return NextResponse.json(empty, { status: 200 });
      }

      const data = await res.json();
      
      // DexScreener API can return either an array directly or { pairs: [...] }
      let pairs = [];
      if (Array.isArray(data)) {
        pairs = data;
      } else if (data?.pairs && Array.isArray(data.pairs)) {
        pairs = data.pairs;
      } else if (data?.data?.pairs && Array.isArray(data.data.pairs)) {
        pairs = data.data.pairs;
      }
      
      const pair = pairs.length > 0 ? pairs[0] : null;
      
      if (!pair) {
        const empty = { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null };
        CACHE.set(mint, { data: empty, timestamp: Date.now() });
        return NextResponse.json(empty);
      }

      const isBase = pair.baseToken?.address?.toLowerCase() === mint.toLowerCase();
      const token = isBase ? pair.baseToken : pair.quoteToken;
      const priceUsd = pair.priceUsd ?? null;
      const priceChange = pair.priceChange?.h24 ?? null;
      const imageUrl = pair.info?.imageUrl ?? null;

      const result = {
        priceUsd: priceUsd ? Number(priceUsd) : null,
        priceChange24h: priceChange != null ? Number(priceChange) : null,
        imageUrl,
        symbol: token?.symbol ?? null,
        name: token?.name ?? null,
      };
      
      CACHE.set(mint, { data: result, timestamp: Date.now() });
      return NextResponse.json(result);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('DexScreener API timeout for mint:', mint);
      } else {
        console.error('DexScreener API fetch error:', fetchError);
      }
      throw fetchError;
    }
  } catch (e) {
    console.error('DEXScreener token fetch error:', e);
    return NextResponse.json(
      { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null },
      { status: 200 }
    );
  }
}
