import { NextResponse } from 'next/server';

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cache token metadata to avoid repeated API calls
const tokenCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GET /api/token/[mint] - Get token metadata from Helius
export async function GET(request, { params }) {
  try {
    const { mint } = await params;
    
    if (!mint || mint.length < 32) {
      return NextResponse.json(
        { error: 'Invalid mint address' },
        { status: 400 }
      );
    }

    // Check cache first
    const cached = tokenCache.get(mint);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return NextResponse.json({ token: cached.data });
    }

    // Get Helius API key from RPC URL
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET || '';
    const apiKeyMatch = rpcUrl.match(/api-key=([^&]+)/);
    const apiKey = apiKeyMatch ? apiKeyMatch[1] : null;

    if (!apiKey) {
      // Fallback: try to get basic info from Solana
      return NextResponse.json({
        token: {
          mint,
          name: 'Unknown Token',
          symbol: 'UNKNOWN',
          image: null,
          decimals: 9,
        }
      });
    }

    // Use Helius DAS API to get token metadata
    const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'token-lookup',
        method: 'getAsset',
        params: { id: mint },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch from Helius');
    }

    const data = await response.json();
    
    if (data.error) {
      // Try devnet if mainnet fails
      const devnetResponse = await fetch(`https://devnet.helius-rpc.com/?api-key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'token-lookup',
          method: 'getAsset',
          params: { id: mint },
        }),
      });

      const devnetData = await devnetResponse.json();
      
      if (devnetData.error) {
        // Return basic info if token not found
        const tokenData = {
          mint,
          name: 'Unknown Token',
          symbol: mint.slice(0, 6).toUpperCase(),
          image: null,
          decimals: 9,
        };
        
        tokenCache.set(mint, { data: tokenData, timestamp: Date.now() });
        return NextResponse.json({ token: tokenData });
      }
      
      const result = devnetData.result;
      const tokenData = {
        mint,
        name: result?.content?.metadata?.name || 'Unknown Token',
        symbol: result?.content?.metadata?.symbol || mint.slice(0, 6).toUpperCase(),
        image: result?.content?.links?.image || result?.content?.files?.[0]?.uri || null,
        decimals: result?.token_info?.decimals || 9,
      };
      
      tokenCache.set(mint, { data: tokenData, timestamp: Date.now() });
      return NextResponse.json({ token: tokenData });
    }

    const result = data.result;
    const tokenData = {
      mint,
      name: result?.content?.metadata?.name || 'Unknown Token',
      symbol: result?.content?.metadata?.symbol || mint.slice(0, 6).toUpperCase(),
      image: result?.content?.links?.image || result?.content?.files?.[0]?.uri || null,
      decimals: result?.token_info?.decimals || 9,
    };

    // Cache the result
    tokenCache.set(mint, { data: tokenData, timestamp: Date.now() });

    return NextResponse.json({ token: tokenData });
  } catch (error) {
    console.error('Error fetching token metadata:', error);
    
    // Return basic info on error
    const { mint } = await params;
    return NextResponse.json({
      token: {
        mint,
        name: 'Unknown Token',
        symbol: mint?.slice(0, 6).toUpperCase() || 'UNKNOWN',
        image: null,
        decimals: 9,
      }
    });
  }
}
