import { NextResponse } from 'next/server';
import { createIntent, getIntents } from '@/lib/supabase';

// GET /api/intents - List intents (with optional filters)
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
export async function POST(request) {
  try {
    const body = await request.json();
    const { tokenSymbol, tokenMint, side, sizeBucket, contact, creator } = body;

    // Validate required fields
    if (!tokenSymbol || !tokenMint || !side || !sizeBucket || !contact || !creator) {
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
    if (!['S', 'M', 'L'].includes(sizeBucket)) {
      return NextResponse.json(
        { error: 'Size bucket must be S, M, or L' },
        { status: 400 }
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
