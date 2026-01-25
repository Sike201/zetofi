import { NextResponse } from 'next/server';
import { getDeal, updateDeal, deleteDeal } from '@/lib/supabase';

// GET /api/deals/[id] - Get a single deal
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    const { data: deal, error } = await getDeal(id);

    if (error) {
      console.error('Error fetching deal:', error);
      return NextResponse.json(
        { error: 'Failed to fetch deal' },
        { status: 500 }
      );
    }

    if (!deal) {
      return NextResponse.json(
        { error: 'Deal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ deal });
  } catch (error) {
    console.error('Error fetching deal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deal' },
      { status: 500 }
    );
  }
}

// PATCH /api/deals/[id] - Update a deal
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, dealPDA, txSignature } = body;

    const updates = {};
    if (status !== undefined) updates.status = status;
    if (dealPDA !== undefined) updates.dealPDA = dealPDA;
    if (txSignature !== undefined) updates.txSignature = txSignature;

    const { data: deal, error } = await updateDeal(id, updates);

    if (error) {
      console.error('Error updating deal:', error);
      return NextResponse.json(
        { error: 'Failed to update deal' },
        { status: 500 }
      );
    }

    if (!deal) {
      return NextResponse.json(
        { error: 'Deal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ deal });
  } catch (error) {
    console.error('Error updating deal:', error);
    return NextResponse.json(
      { error: 'Failed to update deal' },
      { status: 500 }
    );
  }
}

// DELETE /api/deals/[id] - Delete a deal (only if PENDING)
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    
    // First check if deal exists and is PENDING
    const { data: deal, error: fetchError } = await getDeal(id);

    if (fetchError) {
      console.error('Error fetching deal:', fetchError);
      return NextResponse.json(
        { error: 'Failed to fetch deal' },
        { status: 500 }
      );
    }

    if (!deal) {
      return NextResponse.json(
        { error: 'Deal not found' },
        { status: 404 }
      );
    }

    if (deal.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'Can only delete PENDING deals' },
        { status: 400 }
      );
    }

    const { error } = await deleteDeal(id);

    if (error) {
      console.error('Error deleting deal:', error);
      return NextResponse.json(
        { error: 'Failed to delete deal' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting deal:', error);
    return NextResponse.json(
      { error: 'Failed to delete deal' },
      { status: 500 }
    );
  }
}
