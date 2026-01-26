import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAccount,
  getMint,
} from '@solana/spl-token';

// Wrapped SOL mint address
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
import { BN } from 'bn.js';
import { getConnection } from './solana';
import {
  PROGRAM_ID,
  FEE_RECIPIENT,
  generateDealId,
  deriveDealPDA,
  deriveVaultPDA,
  buildInitializeDealData,
  buildDepositBaseData,
  buildAcceptAndSettleData,
  buildCancelDealData,
} from './escrow';

/**
 * Helper to sign a transaction using Privy's signTransaction hook
 * @param {Transaction} transaction - The transaction to sign
 * @param {Object} signingMethod - Object with type, wallet (ConnectedStandardSolanaWallet), and signTransaction hook
 * @param {string} network - 'devnet' or 'mainnet' for Privy chain parameter
 * @returns {Promise<Transaction>} - Signed transaction
 */
async function signTransactionWithMethod(transaction, signingMethod, network = 'devnet') {
  if (signingMethod.type === 'privy' && signingMethod.signTransaction && signingMethod.wallet) {
    // Privy's signTransaction hook from @privy-io/react-auth/solana
    // Expects: { transaction: Uint8Array, wallet: ConnectedStandardSolanaWallet, chain?: SolanaChain }
    // Returns: { signedTransaction: Uint8Array }
    
    // Serialize the full transaction to Uint8Array
    // Note: serialize({ requireAllSignatures: false }) allows serialization without signatures
    const serializedTx = transaction.serialize({ 
      requireAllSignatures: false,
      verifySignatures: false,
    });
    
    // Determine the Solana chain for Privy
    const chain = network === 'mainnet' ? 'solana:mainnet' : 'solana:devnet';
    
    const result = await signingMethod.signTransaction({
      transaction: serializedTx,
      wallet: signingMethod.wallet,
      chain,
    });
    
    // Deserialize the signed transaction back to a Transaction object
    const signedTransaction = Transaction.from(result.signedTransaction);
    return signedTransaction;
  } else {
    throw new Error('No valid signing method available. Ensure you have a connected Solana wallet.');
  }
}

/**
 * Create and deposit escrow in a single transaction (2 instructions)
 * @param {Object} params
 * @param {Object} params.signingMethod - Object with type ('wallet' or 'privy') and signing capability
 * @param {string} params.dealIdString - Human-readable deal ID
 * @param {string} params.seller - Seller pubkey string
 * @param {string} params.buyer - Buyer pubkey string
 * @param {string} params.baseMint - Base token mint string
 * @param {string} params.quoteMint - Quote token mint string
 * @param {string} params.baseAmount - Base amount (in smallest units)
 * @param {string} params.quoteAmount - Quote amount (in smallest units)
 * @param {number} params.expiryTs - Expiry timestamp in seconds
 * @param {string} params.network - 'devnet' or 'mainnet'
 * @returns {Promise<{signature: string, dealPDA: string}>}
 */
export async function createAndDepositEscrow({
  signingMethod,
  dealIdString,
  seller,
  buyer,
  baseMint,
  quoteMint,
  baseAmount,
  quoteAmount,
  expiryTs,
  network = 'devnet',
}) {
  const connection = getConnection(network);
  
  // Verify program exists on this network
  try {
    const programInfo = await connection.getAccountInfo(PROGRAM_ID);
    if (!programInfo) {
      throw new Error(
        `Escrow program not found on ${network}. ` +
        `Program ID: ${PROGRAM_ID.toString()}. ` +
        `Please deploy the program to ${network} or set NEXT_PUBLIC_ZETO_PROGRAM_ID to the correct program ID for ${network}.`
      );
    }
  } catch (error) {
    if (error.message?.includes('Escrow program not found')) {
      throw error;
    }
    // If getAccountInfo fails for other reasons, continue (might be network issue)
    console.warn('Could not verify program existence:', error.message);
  }
  
  // Convert strings to PublicKeys
  const sellerPubkey = new PublicKey(seller);
  const buyerPubkey = new PublicKey(buyer);
  const baseMintPubkey = new PublicKey(baseMint);
  const quoteMintPubkey = new PublicKey(quoteMint);
  
  // Generate deal ID and derive PDAs
  const dealId = generateDealId(dealIdString);
  const [dealPDA, dealBump] = await deriveDealPDA(dealId);
  const [vaultPDA, vaultBump] = await deriveVaultPDA(dealPDA);
  
  // Get seller's base token ATA
  const sellerBaseATA = await getAssociatedTokenAddress(baseMintPubkey, sellerPubkey);

  // Check if seller has the base token ATA with sufficient balance
  try {
    const sellerTokenAccount = await getAccount(connection, sellerBaseATA);
    const balance = BigInt(sellerTokenAccount.amount);
    const requiredAmount = BigInt(baseAmount.toString());
    if (balance < requiredAmount) {
      throw new Error(
        `Insufficient token balance. You have ${balance.toString()} but need ${requiredAmount.toString()}. ` +
        `Please get more tokens from a faucet or transfer them to your wallet.`
      );
    }
    console.log(`Seller token balance: ${balance.toString()}, required: ${requiredAmount.toString()}`);
  } catch (error) {
    if (error.message?.includes('Insufficient token balance')) {
      throw error;
    }
    // ATA doesn't exist - seller doesn't have this token
    throw new Error(
      `You don't have the token ${baseMint} in your wallet. ` +
      `Please get tokens from a devnet faucet (like https://spl-token-faucet.com/) first.`
    );
  }

  // Build initialize_deal instruction
  const initData = buildInitializeDealData(dealId, baseAmount, quoteAmount, expiryTs);
  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: sellerPubkey, isSigner: true, isWritable: true },
      { pubkey: buyerPubkey, isSigner: false, isWritable: false },
      { pubkey: baseMintPubkey, isSigner: false, isWritable: false },
      { pubkey: quoteMintPubkey, isSigner: false, isWritable: false },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initData,
  });
  
  // Build deposit_base instruction
  // Account order from IDL: deal, seller, base_mint, seller_base_ata, vault, token_program, system_program, rent
  const depositData = buildDepositBaseData();
  const depositIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: sellerPubkey, isSigner: true, isWritable: true },
      { pubkey: baseMintPubkey, isSigner: false, isWritable: false },
      { pubkey: sellerBaseATA, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: depositData,
  });
  
  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: sellerPubkey,
  });
  
  transaction.add(initIx);
  transaction.add(depositIx);
  
  // Sign with the provided signing method
  const signedTx = await signTransactionWithMethod(transaction, signingMethod, network);
  
  // Send transaction
  let signature;
  try {
    signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });
  } catch (error) {
    // Check for program not found error
    if (error.message?.includes('does not exist') || error.message?.includes('program') || error.logs?.some(log => log.includes('does not exist'))) {
      throw new Error(
        `Escrow program not deployed on ${network}. ` +
        `Program ID: ${PROGRAM_ID.toString()}. ` +
        `Please deploy the program to ${network} first, or set NEXT_PUBLIC_ZETO_PROGRAM_ID in Vercel to the correct ${network} program ID.`
      );
    }
    throw error;
  }
  
  // Confirm transaction
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');
  
  return {
    signature,
    dealPDA: dealPDA.toBase58(),
  };
}

/**
 * Accept and settle a deal (buyer action)
 * @param {Object} params
 * @param {Object} params.signingMethod - Object with type ('wallet' or 'privy') and signing capability
 * @param {string} params.dealIdString - Human-readable deal ID
 * @param {Object} params.dealData - Deal data from on-chain or off-chain
 * @param {string} params.network - 'devnet' or 'mainnet'
 * @returns {Promise<{signature: string}>}
 */
export async function acceptAndSettle({
  signingMethod,
  dealIdString,
  dealData,
  network = 'devnet',
}) {
  const connection = getConnection(network);
  
  const buyerPubkey = new PublicKey(dealData.buyer);
  const sellerPubkey = new PublicKey(dealData.seller);
  const baseMintPubkey = new PublicKey(dealData.baseMint);
  const quoteMintPubkey = new PublicKey(dealData.quoteMint);
  
  // Derive PDAs
  const dealId = generateDealId(dealIdString);
  const [dealPDA] = await deriveDealPDA(dealId);
  const [vaultPDA] = await deriveVaultPDA(dealPDA);
  
  // Get all ATAs
  const buyerQuoteATA = await getAssociatedTokenAddress(quoteMintPubkey, buyerPubkey);
  const buyerBaseATA = await getAssociatedTokenAddress(baseMintPubkey, buyerPubkey);
  const sellerQuoteATA = await getAssociatedTokenAddress(quoteMintPubkey, sellerPubkey);
  const feeBaseATA = await getAssociatedTokenAddress(baseMintPubkey, FEE_RECIPIENT);
  const feeQuoteATA = await getAssociatedTokenAddress(quoteMintPubkey, FEE_RECIPIENT);
  
  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: buyerPubkey,
  });

  // Check if quote token is wSOL and buyer needs to wrap native SOL
  const isQuoteWSOL = quoteMintPubkey.equals(WSOL_MINT);
  let needsWrap = false;
  let wrapAmount = BigInt(0);

  if (isQuoteWSOL) {
    // Check if buyer has enough wSOL
    try {
      const buyerQuoteAccount = await getAccount(connection, buyerQuoteATA);
      const balance = BigInt(buyerQuoteAccount.amount);
      const required = BigInt(dealData.quoteAmount.toString());
      if (balance < required) {
        needsWrap = true;
        wrapAmount = required - balance;
      }
    } catch {
      // ATA doesn't exist, need to create and wrap
      needsWrap = true;
      wrapAmount = BigInt(dealData.quoteAmount.toString());
    }

    if (needsWrap) {
      // Check if buyer has enough native SOL to wrap
      const buyerSolBalance = await connection.getBalance(buyerPubkey);
      // Add some buffer for transaction fees (0.01 SOL)
      const requiredSol = wrapAmount + BigInt(LAMPORTS_PER_SOL / 100);
      if (BigInt(buyerSolBalance) < requiredSol) {
        throw new Error(
          `Insufficient SOL balance. You need at least ${Number(requiredSol) / LAMPORTS_PER_SOL} SOL ` +
          `(${Number(wrapAmount) / LAMPORTS_PER_SOL} SOL for the trade + fees). ` +
          `You have ${buyerSolBalance / LAMPORTS_PER_SOL} SOL.`
        );
      }

      console.log(`Will wrap ${Number(wrapAmount) / LAMPORTS_PER_SOL} SOL to wSOL`);
    }
  }
  
  // Check and create ATAs if needed
  const atasToCreate = [
    { ata: buyerBaseATA, mint: baseMintPubkey, owner: buyerPubkey },
    { ata: sellerQuoteATA, mint: quoteMintPubkey, owner: sellerPubkey },
    { ata: feeBaseATA, mint: baseMintPubkey, owner: FEE_RECIPIENT },
    { ata: feeQuoteATA, mint: quoteMintPubkey, owner: FEE_RECIPIENT },
  ];

  // For wSOL, we handle the buyer's quote ATA separately
  if (!isQuoteWSOL) {
    atasToCreate.unshift({ ata: buyerQuoteATA, mint: quoteMintPubkey, owner: buyerPubkey });
  }
  
  for (const { ata, mint, owner } of atasToCreate) {
    try {
      await getAccount(connection, ata);
    } catch {
      // ATA doesn't exist, create it
      transaction.add(
        createAssociatedTokenAccountInstruction(buyerPubkey, ata, owner, mint)
      );
    }
  }

  // Handle wSOL wrapping if needed
  if (isQuoteWSOL && needsWrap) {
    // Check if buyer wSOL ATA exists
    let buyerWsolAtaExists = false;
    try {
      await getAccount(connection, buyerQuoteATA);
      buyerWsolAtaExists = true;
    } catch {
      // Need to create the wSOL ATA first
      transaction.add(
        createAssociatedTokenAccountInstruction(buyerPubkey, buyerQuoteATA, buyerPubkey, WSOL_MINT)
      );
    }

    // Transfer native SOL to the wSOL ATA
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: buyerPubkey,
        toPubkey: buyerQuoteATA,
        lamports: wrapAmount,
      })
    );

    // Sync the native balance to update the token balance
    transaction.add(
      createSyncNativeInstruction(buyerQuoteATA)
    );

    console.log('Added wSOL wrap instructions to transaction');
  }
  
  // Build accept_and_settle instruction
  // Account order from IDL: deal, buyer, seller, base_mint, quote_mint, buyer_quote_ata, buyer_base_ata, 
  //                         seller_quote_ata, vault, fee_recipient, fee_base_ata, fee_quote_ata,
  //                         token_program, associated_token_program, system_program
  const settleData = buildAcceptAndSettleData();
  const settleIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: buyerPubkey, isSigner: true, isWritable: true },
      { pubkey: sellerPubkey, isSigner: false, isWritable: true },
      { pubkey: baseMintPubkey, isSigner: false, isWritable: false },
      { pubkey: quoteMintPubkey, isSigner: false, isWritable: false },
      { pubkey: buyerQuoteATA, isSigner: false, isWritable: true },
      { pubkey: buyerBaseATA, isSigner: false, isWritable: true },
      { pubkey: sellerQuoteATA, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: false },
      { pubkey: feeBaseATA, isSigner: false, isWritable: true },
      { pubkey: feeQuoteATA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: settleData,
  });
  
  transaction.add(settleIx);
  
  // Sign with the provided signing method
  const signedTx = await signTransactionWithMethod(transaction, signingMethod, network);
  
  // Send transaction
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  // Confirm transaction
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');
  
  return { signature };
}

/**
 * Cancel a deal (seller action)
 * @param {Object} params
 * @param {Object} params.signingMethod - Object with type ('wallet' or 'privy') and signing capability
 * @param {string} params.dealIdString - Human-readable deal ID
 * @param {Object} params.dealData - Deal data from on-chain or off-chain
 * @param {string} params.network - 'devnet' or 'mainnet'
 * @returns {Promise<{signature: string}>}
 */
export async function cancelDeal({
  signingMethod,
  dealIdString,
  dealData,
  network = 'devnet',
}) {
  const connection = getConnection(network);
  
  const sellerPubkey = new PublicKey(dealData.seller);
  const baseMintPubkey = new PublicKey(dealData.baseMint);
  
  // Derive PDAs
  const dealId = generateDealId(dealIdString);
  const [dealPDA] = await deriveDealPDA(dealId);
  const [vaultPDA] = await deriveVaultPDA(dealPDA);
  
  // Get seller's base token ATA
  const sellerBaseATA = await getAssociatedTokenAddress(baseMintPubkey, sellerPubkey);
  
  // Build transaction
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const transaction = new Transaction({
    recentBlockhash: blockhash,
    feePayer: sellerPubkey,
  });
  
  // Build cancel_deal instruction
  // Account order from IDL: deal, seller, base_mint, seller_base_ata, vault, token_program
  const cancelData = buildCancelDealData();
  const cancelIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: dealPDA, isSigner: false, isWritable: true },
      { pubkey: sellerPubkey, isSigner: true, isWritable: true },
      { pubkey: baseMintPubkey, isSigner: false, isWritable: false },
      { pubkey: sellerBaseATA, isSigner: false, isWritable: true },
      { pubkey: vaultPDA, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: cancelData,
  });
  
  transaction.add(cancelIx);
  
  // Sign with the provided signing method
  const signedTx = await signTransactionWithMethod(transaction, signingMethod, network);
  
  // Send transaction
  const signature = await connection.sendRawTransaction(signedTx.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  
  // Confirm transaction
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight,
  }, 'confirmed');
  
  return { signature };
}

/**
 * Get token balance for an address
 * @param {string} mint - Token mint address
 * @param {string} owner - Owner address
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {Promise<string>} - Balance as string
 */
export async function getTokenBalance(mint, owner, network = 'devnet') {
  try {
    const connection = getConnection(network);
    const mintPubkey = new PublicKey(mint);
    const ownerPubkey = new PublicKey(owner);
    const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
    
    const account = await getAccount(connection, ata);
    return account.amount.toString();
  } catch {
    return '0';
  }
}

/**
 * Get token decimals for a mint
 * @param {string} mint - Token mint address
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {Promise<number>} - Number of decimals
 */
export async function getTokenDecimals(mint, network = 'devnet') {
  try {
    const connection = getConnection(network);
    const mintPubkey = new PublicKey(mint);
    const mintInfo = await getMint(connection, mintPubkey);
    return mintInfo.decimals;
  } catch (error) {
    console.error('Error fetching token decimals:', error);
    // Default to 9 decimals (common for Solana tokens)
    return 9;
  }
}
