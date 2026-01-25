#!/usr/bin/env node
/**
 * Script to create ORGO token on devnet and mint to a recipient
 */

import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import { 
  createMint, 
  getOrCreateAssociatedTokenAccount, 
  mintTo 
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

const RECIPIENT = 'AJtUhtL54ynxY5bVWySgCxQWPRd4XYMzLKYwPPcqCcY6';
const MINT_AMOUNT = 1000_000_000_000; // 1000 ORGO with 9 decimals

async function main() {
  console.log('Creating ORGO token on devnet...\n');

  // Load the CLI wallet keypair
  const keypairPath = path.join(process.env.HOME, '.config/solana/id.json');
  const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
  
  console.log('Payer address:', payer.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  
  const balance = await connection.getBalance(payer.publicKey);
  console.log('Payer balance:', balance / 1e9, 'SOL\n');

  if (balance < 0.1 * 1e9) {
    console.error('Not enough SOL! Need at least 0.1 SOL');
    process.exit(1);
  }

  // Create the mint
  console.log('Creating ORGO token mint...');
  const mint = await createMint(
    connection,
    payer,
    payer.publicKey, // mint authority
    payer.publicKey, // freeze authority
    9 // decimals
  );
  console.log('ORGO Token Mint:', mint.toBase58());

  // Create ATA for recipient and mint tokens
  console.log('\nCreating token account for recipient:', RECIPIENT);
  const recipientPubkey = new (await import('@solana/web3.js')).PublicKey(RECIPIENT);
  
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    recipientPubkey
  );
  console.log('Recipient ATA:', recipientAta.address.toBase58());

  // Mint tokens
  console.log('\nMinting 1000 ORGO to recipient...');
  await mintTo(
    connection,
    payer,
    mint,
    recipientAta.address,
    payer, // mint authority
    MINT_AMOUNT
  );

  console.log('\n✅ Success!');
  console.log('=====================================');
  console.log('ORGO Token Mint:', mint.toBase58());
  console.log('Recipient:', RECIPIENT);
  console.log('Amount minted: 1000 ORGO');
  console.log('=====================================');
  console.log('\nUse this mint address in your deals!');
}

main().catch(console.error);
