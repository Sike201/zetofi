import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import { BN } from 'bn.js';
import { getConnection } from './solana';

// Program ID - UPDATE THIS after deploying your program
// Using a valid base58 placeholder that can be updated after deployment
const PROGRAM_ID_STRING = process.env.NEXT_PUBLIC_ZETO_PROGRAM_ID || '11111111111111111111111111111111';
export const PROGRAM_ID = new PublicKey(PROGRAM_ID_STRING);

// Fee recipient - always 8zat... (canonical fee collection wallet)
const FEE_RECIPIENT_STRING = '8zatMKSZT1xm7p2h7671pUmZQCv6seCd82tU1QmWmxeC';
export const FEE_RECIPIENT = new PublicKey(FEE_RECIPIENT_STRING);

// Fee basis points (0.20% — buyer / quote side only)
export const FEE_BPS = 20;
export const BPS_DENOMINATOR = 10000;

// Deal status enum matching on-chain
export const DealStatus = {
  Initialized: 0,
  Funded: 1,
  Settled: 2,
  Cancelled: 3,
};

export const DealStatusLabels = {
  0: 'INITIALIZED',
  1: 'FUNDED',
  2: 'SETTLED',
  3: 'CANCELLED',
};

/**
 * Generate a unique deal ID as a 32-byte array
 * @param {string} dealIdString - Human-readable deal ID string
 * @returns {Uint8Array} - 32-byte deal ID
 */
export function generateDealId(dealIdString) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(dealIdString);
  const dealId = new Uint8Array(32);
  dealId.set(encoded.slice(0, 32));
  return dealId;
}

/**
 * Derive the Deal PDA
 * @param {Uint8Array} dealId - 32-byte deal ID
 * @returns {Promise<[PublicKey, number]>} - [PDA, bump]
 */
export async function deriveDealPDA(dealId) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('deal'), Buffer.from(dealId)],
    PROGRAM_ID
  );
}

/**
 * Derive the Vault PDA for a deal
 * @param {PublicKey} dealPDA - Deal account PDA
 * @returns {Promise<[PublicKey, number]>} - [PDA, bump]
 */
export async function deriveVaultPDA(dealPDA) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), dealPDA.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Fetch deal account data from chain
 * @param {string} dealIdString - Deal ID string
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {Promise<Object|null>} - Deal data or null if not found
 */
export async function fetchDealOnChain(dealIdString, network = 'devnet') {
  try {
    const connection = getConnection(network);
    const dealId = generateDealId(dealIdString);
    const [dealPDA] = await deriveDealPDA(dealId);
    
    const accountInfo = await connection.getAccountInfo(dealPDA);
    if (!accountInfo) {
      return null;
    }

    // Parse the deal account data
    // Layout: 8 (discriminator) + 32 (deal_id) + 32 (seller) + 32 (buyer) + 32 (base_mint) + 
    //         32 (quote_mint) + 8 (base_amount) + 8 (quote_amount) + 8 (expiry_ts) + 
    //         2 (fee_bps) + 32 (fee_recipient) + 1 (status) + 8 (created_at) + 1 (bump)
    const data = accountInfo.data;
    
    // Skip 8-byte discriminator
    let offset = 8;
    
    const dealIdBytes = data.slice(offset, offset + 32);
    offset += 32;
    
    const seller = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const buyer = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const baseMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const quoteMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const baseAmount = new BN(data.slice(offset, offset + 8), 'le').toString();
    offset += 8;
    
    const quoteAmount = new BN(data.slice(offset, offset + 8), 'le').toString();
    offset += 8;
    
    const expiryTs = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;
    
    const feeBps = data.readUInt16LE(offset);
    offset += 2;
    
    const feeRecipient = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const status = data[offset];
    offset += 1;
    
    const createdAt = new BN(data.slice(offset, offset + 8), 'le').toNumber();
    offset += 8;
    
    const bump = data[offset];

    return {
      dealId: dealIdString,
      dealIdBytes,
      seller: seller.toBase58(),
      buyer: buyer.toBase58(),
      baseMint: baseMint.toBase58(),
      quoteMint: quoteMint.toBase58(),
      baseAmount,
      quoteAmount,
      expiryTs,
      feeBps,
      feeRecipient: feeRecipient.toBase58(),
      status,
      statusLabel: DealStatusLabels[status] || 'UNKNOWN',
      createdAt,
      bump,
      pda: dealPDA.toBase58(),
    };
  } catch (error) {
    console.error('Error fetching deal on-chain:', error);
    return null;
  }
}

/**
 * Check if an ATA exists
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} ata - ATA address
 * @returns {Promise<boolean>}
 */
export async function ataExists(connection, ata) {
  try {
    await getAccount(connection, ata);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get or create ATA instruction
 * @param {Connection} connection - Solana connection
 * @param {PublicKey} payer - Payer for creation
 * @param {PublicKey} mint - Token mint
 * @param {PublicKey} owner - Token account owner
 * @returns {Promise<{address: PublicKey, instruction: TransactionInstruction|null}>}
 */
export async function getOrCreateATA(connection, payer, mint, owner) {
  const ata = await getAssociatedTokenAddress(mint, owner, true);
  const exists = await ataExists(connection, ata);
  
  if (exists) {
    return { address: ata, instruction: null };
  }
  
  const instruction = createAssociatedTokenAccountInstruction(
    payer,
    ata,
    owner,
    mint
  );
  
  return { address: ata, instruction };
}

/**
 * Calculate fees for a deal. Only buyer (quote side) pays 0.2%; seller pays nothing.
 * @param {string|number} baseAmount - Base token amount
 * @param {string|number} quoteAmount - Quote token amount
 * @param {number} feeBps - Fee in basis points (default 20 = 0.2%)
 * @returns {Object} - Fee calculations
 */
export function calculateFees(baseAmount, quoteAmount, feeBps = FEE_BPS) {
  const base = BigInt(baseAmount);
  const quote = BigInt(quoteAmount);
  const bps = BigInt(feeBps);
  const denom = BigInt(BPS_DENOMINATOR);

  const sellerFee = BigInt(0);
  const buyerFee = (quote * bps) / denom;
  const baseToBuyer = base;
  const quoteToSeller = quote - buyerFee;

  return {
    sellerFee: sellerFee.toString(),
    buyerFee: buyerFee.toString(),
    baseToBuyer: baseToBuyer.toString(),
    quoteToSeller: quoteToSeller.toString(),
  };
}

/**
 * Build initialize_deal instruction data
 * @param {Uint8Array} dealId - 32-byte deal ID
 * @param {string} baseAmount - Base amount as string
 * @param {string} quoteAmount - Quote amount as string
 * @param {number} expiryTs - Expiry timestamp in seconds
 * @returns {Buffer} - Instruction data
 */
export function buildInitializeDealData(dealId, baseAmount, quoteAmount, expiryTs) {
  // Anchor discriminator for initialize_deal (from IDL)
  const discriminator = Buffer.from([100, 154, 180, 148, 120, 1, 196, 122]);
  
  const dealIdBuffer = Buffer.from(dealId);
  const baseAmountBuffer = Buffer.alloc(8);
  new BN(baseAmount).toArrayLike(Buffer, 'le', 8).copy(baseAmountBuffer);
  const quoteAmountBuffer = Buffer.alloc(8);
  new BN(quoteAmount).toArrayLike(Buffer, 'le', 8).copy(quoteAmountBuffer);
  const expiryBuffer = Buffer.alloc(8);
  new BN(expiryTs).toArrayLike(Buffer, 'le', 8).copy(expiryBuffer);

  return Buffer.concat([discriminator, dealIdBuffer, baseAmountBuffer, quoteAmountBuffer, expiryBuffer]);
}

/**
 * Build deposit_base instruction data
 * @returns {Buffer} - Instruction data
 */
export function buildDepositBaseData() {
  // Anchor discriminator for deposit_base (from IDL)
  return Buffer.from([213, 125, 25, 122, 8, 72, 100, 237]);
}

/**
 * Build accept_and_settle instruction data
 * @returns {Buffer} - Instruction data
 */
export function buildAcceptAndSettleData() {
  // Anchor discriminator for accept_and_settle (from IDL)
  return Buffer.from([2, 3, 111, 42, 76, 102, 198, 115]);
}

/**
 * Build cancel_deal instruction data
 * @returns {Buffer} - Instruction data
 */
export function buildCancelDealData() {
  // Anchor discriminator for cancel_deal (from IDL)
  return Buffer.from([158, 86, 193, 45, 168, 111, 48, 29]);
}

/**
 * Build reclaim_expired instruction data
 * @returns {Buffer} - Instruction data
 */
export function buildReclaimExpiredData() {
  // Anchor discriminator for reclaim_expired (from IDL)
  return Buffer.from([125, 185, 48, 75, 0, 71, 93, 98]);
}

// Export constants for use in frontend
export { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram, SYSVAR_RENT_PUBKEY };
