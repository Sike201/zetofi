-- ============================================================================
-- Zeto Escrow - Supabase Database Schema
-- Run this SQL in your Supabase SQL Editor
-- ============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Deals Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY,
  seller TEXT NOT NULL,
  buyer TEXT NOT NULL,
  base_mint TEXT NOT NULL,
  quote_mint TEXT NOT NULL,
  base_amount TEXT NOT NULL,
  quote_amount TEXT NOT NULL,
  base_decimals INTEGER DEFAULT 9,
  quote_decimals INTEGER DEFAULT 9,
  expiry_ts BIGINT NOT NULL,
  fee_bps INTEGER DEFAULT 10,
  network TEXT DEFAULT 'devnet',
  status TEXT DEFAULT 'PENDING',
  deal_pda TEXT,
  tx_signature TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: Add decimals columns to existing table (run if table already exists)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deals' AND column_name = 'base_decimals') THEN
    ALTER TABLE deals ADD COLUMN base_decimals INTEGER DEFAULT 9;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'deals' AND column_name = 'quote_decimals') THEN
    ALTER TABLE deals ADD COLUMN quote_decimals INTEGER DEFAULT 9;
  END IF;
END $$;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_deals_seller ON deals(seller);
CREATE INDEX IF NOT EXISTS idx_deals_buyer ON deals(buyer);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at DESC);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_deals_updated_at ON deals;
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Intents Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS intents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  token_symbol TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  size_bucket TEXT NOT NULL CHECK (size_bucket IN ('S', 'M', 'L')),
  contact TEXT NOT NULL,
  creator TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_intents_token_mint ON intents(token_mint);
CREATE INDEX IF NOT EXISTS idx_intents_side ON intents(side);
CREATE INDEX IF NOT EXISTS idx_intents_creator ON intents(creator);
CREATE INDEX IF NOT EXISTS idx_intents_created_at ON intents(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- For production, you should enable RLS and create appropriate policies
-- ============================================================================

-- Enable RLS on tables (uncomment when ready for production)
-- ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE intents ENABLE ROW LEVEL SECURITY;

-- Example policies (customize based on your auth setup):

-- Allow anyone to read deals (they need the link anyway)
-- CREATE POLICY "Deals are viewable by everyone" ON deals
--   FOR SELECT USING (true);

-- Allow anyone to insert deals (auth is handled by Privy + wallet signature)
-- CREATE POLICY "Anyone can create deals" ON deals
--   FOR INSERT WITH CHECK (true);

-- Only allow updates from authenticated users who are participants
-- CREATE POLICY "Participants can update deals" ON deals
--   FOR UPDATE USING (true);

-- Similar policies for intents
-- CREATE POLICY "Intents are viewable by everyone" ON intents
--   FOR SELECT USING (true);

-- CREATE POLICY "Anyone can create intents" ON intents
--   FOR INSERT WITH CHECK (true);

-- ============================================================================
-- Grants (for the anon key)
-- ============================================================================
GRANT ALL ON deals TO anon;
GRANT ALL ON intents TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
