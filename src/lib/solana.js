import { PublicKey, Connection } from '@solana/web3.js';

export const NETWORKS = {
  devnet: {
    name: 'Devnet',
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET || 'https://api.devnet.solana.com',
    explorer: 'https://solscan.io',
    explorerSuffix: '?cluster=devnet',
  },
  mainnet: {
    name: 'Mainnet',
    rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com',
    explorer: 'https://solscan.io',
    explorerSuffix: '',
  },
};

export const DEFAULT_NETWORK = 'devnet';

export const USDC_MINTS = {
  devnet: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',
  mainnet: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

export const DEFAULT_QUOTE_MINT = process.env.NEXT_PUBLIC_DEFAULT_QUOTE_MINT || USDC_MINTS.devnet;

/**
 * Get USDC mint address for a network
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {string} - USDC mint address
 */
export function getUsdcMint(network = DEFAULT_NETWORK) {
  return USDC_MINTS[network] || USDC_MINTS.mainnet;
}

// Connection cache to avoid creating multiple connections
const connectionCache = {};

/**
 * Validate a Solana public key
 * @param {string} pubkeyString - The public key string to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidPubkey(pubkeyString) {
  if (!pubkeyString || typeof pubkeyString !== 'string') return false;
  try {
    new PublicKey(pubkeyString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a public key string, returning null if invalid
 * @param {string} pubkeyString - The public key string
 * @returns {PublicKey|null} - PublicKey or null
 */
export function parsePubkey(pubkeyString) {
  try {
    return new PublicKey(pubkeyString);
  } catch {
    return null;
  }
}

/**
 * Get a Connection instance for the specified network
 * Uses Helius RPC for better performance
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {Connection} - Solana Connection instance
 */
export function getConnection(network = DEFAULT_NETWORK) {
  // Return cached connection if exists
  if (connectionCache[network]) {
    return connectionCache[network];
  }

  const networkConfig = NETWORKS[network] || NETWORKS[DEFAULT_NETWORK];
  const connection = new Connection(networkConfig.rpcUrl, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
  });

  // Cache the connection
  connectionCache[network] = connection;
  
  return connection;
}

/**
 * Format a public key for display (truncate)
 * @param {string} pubkey - The public key string
 * @param {number} chars - Number of characters to show on each side
 * @returns {string} - Formatted string like "Abc...xyz"
 */
export function formatPubkey(pubkey, chars = 4) {
  if (!pubkey || pubkey.length < chars * 2) return pubkey || '';
  return `${pubkey.slice(0, chars)}...${pubkey.slice(-chars)}`;
}

/**
 * Get explorer URL for a transaction
 * @param {string} signature - Transaction signature
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {string} - Explorer URL
 */
export function getExplorerTxUrl(signature, network = DEFAULT_NETWORK) {
  const config = NETWORKS[network] || NETWORKS[DEFAULT_NETWORK];
  return `${config.explorer}/tx/${signature}${config.explorerSuffix}`;
}

/**
 * Get explorer URL for an account
 * @param {string} address - Account address
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {string} - Explorer URL
 */
export function getExplorerAccountUrl(address, network = DEFAULT_NETWORK) {
  const config = NETWORKS[network] || NETWORKS[DEFAULT_NETWORK];
  return `${config.explorer}/address/${address}${config.explorerSuffix}`;
}

/**
 * Get the current RPC URL being used
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {string} - RPC URL
 */
export function getRpcUrl(network = DEFAULT_NETWORK) {
  const config = NETWORKS[network] || NETWORKS[DEFAULT_NETWORK];
  return config.rpcUrl;
}

/**
 * Check if using Helius RPC
 * @param {string} network - 'devnet' or 'mainnet'
 * @returns {boolean} - True if using Helius
 */
export function isUsingHelius(network = DEFAULT_NETWORK) {
  const rpcUrl = getRpcUrl(network);
  return rpcUrl.includes('helius');
}
