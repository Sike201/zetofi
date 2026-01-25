import { NextResponse } from 'next/server';

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

    const res = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${mint}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) {
      return NextResponse.json(
        { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null },
        { status: 200 }
      );
    }

    const pairs = await res.json();
    const pair = Array.isArray(pairs) && pairs.length > 0 ? pairs[0] : null;
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

    const data = {
      priceUsd,
      priceChange24h: priceChange != null ? Number(priceChange) : null,
      imageUrl,
      symbol: token?.symbol ?? null,
      name: token?.name ?? null,
    };
    CACHE.set(mint, { data, timestamp: Date.now() });
    return NextResponse.json(data);
  } catch (e) {
    console.error('DEXScreener token fetch error:', e);
    return NextResponse.json(
      { priceUsd: null, priceChange24h: null, imageUrl: null, symbol: null, name: null },
      { status: 200 }
    );
  }
}
