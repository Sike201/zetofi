import { NextResponse } from 'next/server';
import { createIntent, getIntents, deleteIntent } from '@/lib/supabase';
import { verifySolanaMessage, verifyCreateMessage, verifyDeleteMessage } from '@/lib/verifySignature';

// Configure runtime for Vercel
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/intents - List intents (with optional filters)
// Viewable by everyone - no authentication required
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const tokenMint = searchParams.get('tokenMint');
    const side = searchParams.get('side');
    const creator = searchParams.get('creator');

    const filters = {};
    if (tokenMint) filters.tokenMint = tokenMint;
    if (side) filters.side = side;
    if (creator) filters.creator = creator;

    const { data: intents, error } = await getIntents(filters);

    if (error) {
      console.error('Error fetching intents:', error);
      return NextResponse.json(
        { error: 'Failed to fetch intents' },
        { status: 500 }
      );
    }

    return NextResponse.json({ intents: intents || [] });
  } catch (error) {
    console.error('Error fetching intents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch intents' },
      { status: 500 }
    );
  }
}

// POST /api/intents - Create a new intent
// Requires signed message proving wallet ownership
export async function POST(request) {
  try {
    const body = await request.json();
    const { tokenSymbol, tokenMint, side, sizeBucket, contact, creator, message, signature } = body;

    if (!creator || !message || !signature) {
      return NextResponse.json(
        { error: 'Authentication required. Sign the message with your wallet.' },
        { status: 401 }
      );
    }

    if (creator.length < 32 || creator.length > 44) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 }
      );
    }

    if (!verifyCreateMessage(message)) {
      return NextResponse.json(
        { error: 'Invalid or expired message. Please try again.' },
        { status: 401 }
      );
    }

    if (!verifySolanaMessage(message, signature, creator)) {
      return NextResponse.json(
        { error: 'Invalid signature. Sign the message with your wallet.' },
        { status: 401 }
      );
    }

    // Validate required fields
    if (!tokenSymbol || !tokenMint || !side || !sizeBucket || !contact) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate side
    if (!['BUY', 'SELL'].includes(side)) {
      return NextResponse.json(
        { error: 'Side must be BUY or SELL' },
        { status: 400 }
      );
    }

    // Validate sizeBucket
    if (!['S', 'M', 'L', 'XL'].includes(sizeBucket)) {
      return NextResponse.json(
        { error: 'Size bucket must be S, M, L, or XL' },
        { status: 400 }
      );
    }

    // Check intent limit (max 7 intents per user)
    const { data: existingIntents, error: countError } = await getIntents({ creator });
    
    if (countError) {
      console.error('Error checking intent count:', countError);
      return NextResponse.json(
        { error: 'Failed to verify intent limit' },
        { status: 500 }
      );
    }

    const intentCount = existingIntents?.length || 0;
    if (intentCount >= 7) {
      return NextResponse.json(
        { error: 'Maximum limit reached. You can have up to 7 active intents. Please delete an existing intent to create a new one.' },
        { status: 403 }
      );
    }

    const { data: intent, error } = await createIntent({
      tokenSymbol,
      tokenMint,
      side,
      sizeBucket,
      contact,
      creator,
    });

    if (error) {
      console.error('Error creating intent:', error);
      return NextResponse.json(
        { error: 'Failed to create intent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ intent }, { status: 201 });
  } catch (error) {
    console.error('Error creating intent:', error);
    return NextResponse.json(
      { error: 'Failed to create intent' },
      { status: 500 }
    );
  }
}

// DELETE /api/intents - Delete an intent
// Requires signed message proving wallet ownership. Send id, creator, message, signature in body.
export async function DELETE(request) {
  try {
    let body = null;
    try {
      body = await request.json();
    } catch {
      // No body
    }
    const intentId = body?.id ?? request.nextUrl?.searchParams?.get('id');
    const creator = body?.creator ?? request.nextUrl?.searchParams?.get('creator');
    const message = body?.message;
    const signature = body?.signature;

    if (!creator || !message || !signature) {
      return NextResponse.json(
        { error: 'Authentication required. Sign the message with your wallet.' },
        { status: 401 }
      );
    }

    if (!intentId) {
      return NextResponse.json(
        { error: 'Intent ID is required' },
        { status: 400 }
      );
    }

    if (!verifyDeleteMessage(message, intentId)) {
      return NextResponse.json(
        { error: 'Invalid or expired message. Please try again.' },
        { status: 401 }
      );
    }

    if (!verifySolanaMessage(message, signature, creator)) {
      return NextResponse.json(
        { error: 'Invalid signature. Sign the message with your wallet.' },
        { status: 401 }
      );
    }

    const { data: intent, error } = await deleteIntent(intentId, creator);

    if (error) {
      if (error.message?.includes('Unauthorized')) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 }
        );
      }
      if (error.message?.includes('not found')) {
        return NextResponse.json(
          { error: error.message },
          { status: 404 }
        );
      }
      console.error('Error deleting intent:', error);
      return NextResponse.json(
        { error: 'Failed to delete intent' },
        { status: 500 }
      );
    }

    return NextResponse.json({ intent }, { status: 200 });
  } catch (error) {
    console.error('Error deleting intent:', error);
    return NextResponse.json(
      { error: 'Failed to delete intent' },
      { status: 500 }
    );
  }
}
