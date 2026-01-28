import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabase = null;
if (supabaseUrl && supabaseAnonKey) {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
  });
} else if (typeof window !== 'undefined') {
  console.warn('Supabase credentials not found. Check .env.local');
}

export { supabase };

/** @param {Object} deal @returns {Promise<{data: Object|null, error: Error|null}>} */
export async function createDeal(deal) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  const { data, error } = await supabase
    .from('deals')
    .insert([{
      id: deal.id,
      seller: deal.seller,
      buyer: deal.buyer,
      base_mint: deal.baseMint,
      quote_mint: deal.quoteMint,
      base_amount: deal.baseAmount,
      quote_amount: deal.quoteAmount,
      base_decimals: deal.baseDecimals ?? 9,
      quote_decimals: deal.quoteDecimals ?? 9,
      expiry_ts: deal.expiryTs,
      fee_bps: deal.feeBps || 10,
      network: deal.network || 'devnet',
      status: deal.status || 'PENDING',
      deal_pda: deal.dealPDA || null,
      tx_signature: deal.txSignature || null,
    }])
    .select()
    .single();

  return { data: data ? mapDealFromDb(data) : null, error };
}

/** @param {string} id @returns {Promise<{data: Object|null, error: Error|null}>} */
export async function getDeal(id) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('id', id)
    .single();

  return { data: data ? mapDealFromDb(data) : null, error };
}

/** @param {Object} filters - optional seller, buyer, status @returns {Promise<{data: Array|null, error: Error|null}>} */
export async function getDeals(filters = {}) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  let query = supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.seller) {
    query = query.eq('seller', filters.seller);
  }
  if (filters.buyer) {
    query = query.eq('buyer', filters.buyer);
  }
  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;

  return { 
    data: data ? data.map(mapDealFromDb) : null, 
    error 
  };
}

/** @param {string} id @param {Object} updates @returns {Promise<{data: Object|null, error: Error|null}>} */
export async function updateDeal(id, updates) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  const updateData = {};
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dealPDA !== undefined) updateData.deal_pda = updates.dealPDA;
  if (updates.txSignature !== undefined) updateData.tx_signature = updates.txSignature;

  const { data, error } = await supabase
    .from('deals')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  return { data: data ? mapDealFromDb(data) : null, error };
}

/** @param {string} id (only if PENDING) @returns {Promise<{error: Error|null}>} */
export async function deleteDeal(id) {
  if (!supabase) {
    return { error: { message: 'Supabase not configured' } };
  }
  const { error } = await supabase
    .from('deals')
    .delete()
    .eq('id', id)
    .eq('status', 'PENDING'); // Only delete pending deals

  return { error };
}

// ============================================================================
// Intents
// ============================================================================

/** @param {Object} intent @returns {Promise<{data: Object|null, error: Error|null}>} */
export async function createIntent(intent) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  const { data, error } = await supabase
    .from('intents')
    .insert([{
      token_symbol: intent.tokenSymbol,
      token_mint: intent.tokenMint,
      side: intent.side,
      size_bucket: intent.sizeBucket,
      contact: intent.contact,
      creator: intent.creator,
    }])
    .select()
    .single();

  return { data: data ? mapIntentFromDb(data) : null, error };
}

/** @param {Object} filters - tokenMint, side, creator @returns {Promise<{data: Array|null, error: Error|null}>} */
export async function getIntents(filters = {}) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  let query = supabase
    .from('intents')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.tokenMint) {
    query = query.eq('token_mint', filters.tokenMint);
  }
  if (filters.side) {
    query = query.eq('side', filters.side);
  }
  if (filters.creator) {
    query = query.eq('creator', filters.creator);
  }

  const { data, error } = await query;

  return { 
    data: data ? data.map(mapIntentFromDb) : null, 
    error 
  };
}

/** @param {string} intentId @param {string} creator (auth) @returns {Promise<{data: Object|null, error: Error|null}>} */
export async function deleteIntent(intentId, creator) {
  if (!supabase) {
    return { data: null, error: { message: 'Supabase not configured' } };
  }
  
  // First verify the intent belongs to the creator
  const { data: intent, error: fetchError } = await supabase
    .from('intents')
    .select('creator')
    .eq('id', intentId)
    .single();

  if (fetchError || !intent) {
    return { data: null, error: { message: 'Intent not found' } };
  }

  if (intent.creator !== creator) {
    return { data: null, error: { message: 'Unauthorized: You can only delete your own intents' } };
  }

  const { data, error } = await supabase
    .from('intents')
    .delete()
    .eq('id', intentId)
    .select()
    .single();

  return { data: data ? mapIntentFromDb(data) : null, error };
}

// ============================================================================
// Mappers (snake_case DB -> camelCase JS)
// ============================================================================

function mapDealFromDb(row) {
  return {
    id: row.id,
    seller: row.seller,
    buyer: row.buyer,
    baseMint: row.base_mint,
    quoteMint: row.quote_mint,
    baseAmount: row.base_amount,
    quoteAmount: row.quote_amount,
    baseDecimals: row.base_decimals ?? 9,
    quoteDecimals: row.quote_decimals ?? 9,
    expiryTs: row.expiry_ts,
    feeBps: row.fee_bps,
    network: row.network,
    status: row.status,
    dealPDA: row.deal_pda,
    txSignature: row.tx_signature,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIntentFromDb(row) {
  return {
    id: row.id,
    tokenSymbol: row.token_symbol,
    tokenMint: row.token_mint,
    side: row.side,
    sizeBucket: row.size_bucket,
    contact: row.contact,
    creator: row.creator,
    createdAt: row.created_at,
  };
}

export default supabase;
