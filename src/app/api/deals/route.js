import { NextResponse } from 'next/server';
import { createDeal, getDeals } from '@/lib/supabase';

// GET /api/deals - List deals (with optional filters)
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const seller = searchParams.get('seller');
    const buyer = searchParams.get('buyer');
    const status = searchParams.get('status');

    const filters = {};
    if (seller) filters.seller = seller;
    if (buyer) filters.buyer = buyer;
    if (status) filters.status = status;

    const { data: deals, error } = await getDeals(filters);

    if (error) {
      console.error('Error fetching deals:', error);
      return NextResponse.json(
        { error: 'Failed to fetch deals' },
        { status: 500 }
      );
    }

    return NextResponse.json({ deals: deals || [] });
  } catch (error) {
    console.error('Error fetching deals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deals' },
      { status: 500 }
    );
  }
}

// POST /api/deals - Create a new deal
export async function POST(request) {
  try {
    const body = await request.json();
    const {
      id,
      seller,
      buyer,
      baseMint,
      quoteMint,
      baseAmount,
      quoteAmount,
      baseDecimals = 9,
      quoteDecimals = 9,
      expiryTs,
      feeBps = 10,
      network = 'devnet',
    } = body;

    // Validate required fields
    if (!id || !seller || !buyer || !baseMint || !quoteMint || !baseAmount || !quoteAmount || !expiryTs) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const { data: deal, error } = await createDeal({
      id,
      seller,
      buyer,
      baseMint,
      quoteMint,
      baseAmount: baseAmount.toString(),
      quoteAmount: quoteAmount.toString(),
      baseDecimals: parseInt(baseDecimals),
      quoteDecimals: parseInt(quoteDecimals),
      expiryTs: parseInt(expiryTs),
      feeBps,
      network,
      status: 'PENDING',
    });

    if (error) {
      console.error('Error creating deal:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      // Check for duplicate key error
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Deal with this ID already exists' },
          { status: 409 }
        );
      }
      
      // Check for table not found error
      if (error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist')) {
        return NextResponse.json(
          { error: 'Database tables not set up. Please run the SQL schema in Supabase.' },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: error.message || 'Failed to create deal' },
        { status: 500 }
      );
    }

    return NextResponse.json({ deal }, { status: 201 });
  } catch (error) {
    console.error('Error creating deal:', error);
    return NextResponse.json(
      { error: 'Failed to create deal' },
      { status: 500 }
    );
  }
}
