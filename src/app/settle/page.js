'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy, useLogin } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Select from '@/components/Select';
import TokenInput from '@/components/TokenInput';
import ScrollReveal from '@/components/ScrollReveal';
import { isValidPubkey, formatPubkey, getUsdcMint } from '@/lib/solana';
import { formatNumber } from '@/lib/format';
import { createAndDepositEscrow, getTokenDecimals } from '@/lib/escrowClient';
import { FEE_BPS } from '@/lib/escrow';

const ROLES = [
  { value: 'seller', label: 'Seller (Create & Deposit)' },
  { value: 'buyer', label: 'Buyer (Accept existing deal)' },
];

export default function SettlePage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  // Use Solana-specific wallet hook for proper signing support
  const { wallets: solanaWallets, ready: walletsReady } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();
  const { login } = useLogin({
    onComplete: () => {
      // After login completes, the wallets array should update
      console.log('Login complete, solanaWallets:', solanaWallets);
    },
  });
  const [role, setRole] = useState('');
  const [network, setNetwork] = useState('devnet');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [formData, setFormData] = useState({
    baseMint: '',
    baseAmount: '',
    quoteMint: getUsdcMint('devnet'), // Lock to USDC
    quoteAmount: '',
    counterparty: '',
    expiryHours: '24',
  });

  const [errors, setErrors] = useState({});
  
  // Token metadata state
  const [baseTokenInfo, setBaseTokenInfo] = useState(null);
  const [quoteTokenInfo, setQuoteTokenInfo] = useState(null);

  // Wallet address comes from user.wallet (always available when authenticated)
  // This is the address shown in the header
  const walletAddress = user?.wallet?.address;
  
  // Get active Solana wallet from useSolanaWallets - these are ConnectedStandardSolanaWallet objects
  const activeWallet = solanaWallets.find(w => w.address === walletAddress) || solanaWallets[0] || null;
  
  // Check if we can sign - need an active Solana wallet with signing capability
  const canSign = authenticated && walletsReady && activeWallet;
  
  // Track if we need to show reconnect prompt (only after failed sign attempt)
  const [needsReconnect, setNeedsReconnect] = useState(false);

  // Function to connect wallet (without logging out)
  function handleConnectWallet() {
    setSubmitError('');
    setNeedsReconnect(false);
    // Just open the login modal - this will prompt wallet connection
    login();
  }

  // Function to fully reconnect wallet (logout + login)
  async function handleReconnect() {
    setSubmitError('');
    setNeedsReconnect(false);
    await logout();
    login();
  }

  // Function to get signing capability
  // Returns an object with the Privy signTransaction hook and the active Solana wallet
  function getSigningMethod() {
    // Use Privy's signTransaction hook with the ConnectedStandardSolanaWallet
    if (activeWallet && signTransaction) {
      console.log('Using Privy signTransaction with Solana wallet:', activeWallet.address);
      return { type: 'privy', wallet: activeWallet, signTransaction };
    }
    
    return null;
  }

  useEffect(() => {
    if (ready && !authenticated && role) {
      setRole('');
    }
  }, [ready, authenticated, role]);

  // Debug: Log wallet state
  useEffect(() => {
    if (ready && authenticated) {
      console.log('🔐 Settle Page Wallet Debug:');
      console.log('- Solana wallets from useSolanaWallets():', solanaWallets.length);
      console.log('- Wallets ready:', walletsReady);
      console.log('- User wallet:', user?.wallet);
      console.log('- Active Solana wallet:', activeWallet?.address);
      console.log('- Can sign:', canSign);
      console.log('- Privy signTransaction available:', !!signTransaction);
    }
  }, [ready, authenticated, solanaWallets, walletsReady, user, activeWallet, canSign, signTransaction]);

  // Fetch token metadata when mint addresses change
  const fetchTokenInfo = useCallback(async (mint, setInfo) => {
    if (!mint || !isValidPubkey(mint)) {
      setInfo(null);
      return;
    }
    try {
      const response = await fetch(`/api/token/${mint}`);
      if (response.ok) {
        const { token } = await response.json();
        setInfo(token);
      }
    } catch (err) {
      console.error('Token lookup error:', err);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTokenInfo(formData.baseMint, setBaseTokenInfo);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.baseMint, fetchTokenInfo]);

  // Update quote mint when network changes (always USDC)
  useEffect(() => {
    const usdcMint = getUsdcMint(network);
    setFormData((prev) => ({ ...prev, quoteMint: usdcMint }));
  }, [network]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTokenInfo(formData.quoteMint, setQuoteTokenInfo);
    }, 500);
    return () => clearTimeout(timer);
  }, [formData.quoteMint, fetchTokenInfo]);

  function validateForm() {
    const newErrors = {};

    if (!formData.baseMint.trim()) {
      newErrors.baseMint = 'Base token mint is required';
    } else if (!isValidPubkey(formData.baseMint)) {
      newErrors.baseMint = 'Invalid public key';
    }

    if (!formData.baseAmount.trim()) {
      newErrors.baseAmount = 'Base amount is required';
    } else if (isNaN(parseFloat(formData.baseAmount)) || parseFloat(formData.baseAmount) <= 0) {
      newErrors.baseAmount = 'Must be a positive number';
    }

    // Quote mint is locked to USDC, so just validate it exists
    if (!formData.quoteMint.trim() || !isValidPubkey(formData.quoteMint)) {
      newErrors.quoteMint = 'USDC mint address is required';
    }

    if (!formData.quoteAmount.trim()) {
      newErrors.quoteAmount = 'Quote amount is required';
    } else if (isNaN(parseFloat(formData.quoteAmount)) || parseFloat(formData.quoteAmount) <= 0) {
      newErrors.quoteAmount = 'Must be a positive number';
    }

    if (!formData.counterparty.trim()) {
      newErrors.counterparty = 'Counterparty address is required';
    } else if (!isValidPubkey(formData.counterparty)) {
      newErrors.counterparty = 'Invalid public key';
    }

    if (!formData.expiryHours.trim()) {
      newErrors.expiryHours = 'Expiry is required';
    } else if (isNaN(parseInt(formData.expiryHours)) || parseInt(formData.expiryHours) <= 0) {
      newErrors.expiryHours = 'Must be a positive number';
    }

    if (!role) {
      newErrors.role = 'Please select your role';
    }

    if (!authenticated) {
      newErrors.auth = 'Please login to create a deal';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function calculateFees() {
    const baseAmount = parseFloat(formData.baseAmount) || 0;
    const quoteAmount = parseFloat(formData.quoteAmount) || 0;

    const buyerFee = quoteAmount * (FEE_BPS / 10000);
    const sellerFee = 0;

    return {
      buyerFee,
      sellerFee,
      buyerReceives: baseAmount,
      sellerReceives: quoteAmount - buyerFee,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitError('');
    setNeedsReconnect(false);

    if (!validateForm()) return;

    // Only sellers can create deals from this page
    if (role !== 'seller') {
      setSubmitError('As a buyer, you need a deal link from the seller. Ask the seller to create the deal first.');
      return;
    }

    // Get signing method
    const signingMethod = getSigningMethod();
    if (!signingMethod) {
      // No signing capability - show reconnect prompt
      setNeedsReconnect(true);
      setSubmitError('Unable to sign transactions. Please reconnect your wallet.');
      return;
    }

    setIsSubmitting(true);

    try {
      const expiryTs = Math.floor(Date.now() / 1000) + parseInt(formData.expiryHours) * 3600;
      const dealId = `deal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Fetch actual decimals from the token mints
      const [baseDecimals, quoteDecimals] = await Promise.all([
        getTokenDecimals(formData.baseMint.trim(), network),
        getTokenDecimals(formData.quoteMint.trim(), network),
      ]);
      
      console.log(`Token decimals - Base: ${baseDecimals}, Quote: ${quoteDecimals}`);
      
      // Convert amounts to smallest units using actual decimals
      const baseAmountRaw = Math.floor(parseFloat(formData.baseAmount) * Math.pow(10, baseDecimals)).toString();
      const quoteAmountRaw = Math.floor(parseFloat(formData.quoteAmount) * Math.pow(10, quoteDecimals)).toString();

      // First, save deal to database as PENDING
      const dealData = {
        id: dealId,
        seller: walletAddress,
        buyer: formData.counterparty.trim(),
        baseMint: formData.baseMint.trim(),
        quoteMint: formData.quoteMint.trim(),
        baseAmount: baseAmountRaw,
        quoteAmount: quoteAmountRaw,
        baseDecimals,
        quoteDecimals,
        expiryTs,
        feeBps: FEE_BPS,
        network,
      };

      const createResponse = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dealData),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || 'Failed to create deal record');
      }

      // Now create on-chain escrow and deposit
      try {
        const { signature, dealPDA } = await createAndDepositEscrow({
          signingMethod,
          dealIdString: dealId,
          seller: walletAddress,
          buyer: formData.counterparty.trim(),
          baseMint: formData.baseMint.trim(),
          quoteMint: formData.quoteMint.trim(),
          baseAmount: baseAmountRaw,
          quoteAmount: quoteAmountRaw,
          expiryTs,
          network,
        });

        // Update deal with on-chain data
        await fetch(`/api/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'FUNDED',
            dealPDA,
            txSignature: signature,
          }),
        });

        // Redirect to deal page
        router.push(`/deal/${dealId}`);
      } catch (txError) {
        console.error('Transaction error:', txError);
        // Update deal status to show it failed
        await fetch(`/api/deals/${dealId}`, {
          method: 'DELETE',
        });
        throw new Error(`Transaction failed: ${txError.message}`);
      }
    } catch (error) {
      console.error('Error creating deal:', error);
      setSubmitError(error.message || 'Failed to create deal');
    } finally {
      setIsSubmitting(false);
    }
  }

  const fees = calculateFees();
  
  // Get token symbols for display
  const baseSymbol = baseTokenInfo?.symbol || 'tokens';
  const quoteSymbol = quoteTokenInfo?.symbol || 'tokens';

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-playfair-display)] text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Settle Deal
          </h1>
        </div>
      </ScrollReveal>

      <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
        <div className="mt-8">
          <Card>
          <h2 className="mb-4 text-xl font-semibold text-white">
            Create Deal
          </h2>
          
          {!authenticated && (
            <div className="mb-4 rounded-lg bg-[#1a1a1a] p-3">
              <p className="text-sm text-white/70">
                Please login to create a deal.
              </p>
            </div>
          )}

          {submitError && (
            <div className="mb-4 rounded-lg bg-[#1a1a1a] p-4">
              <p className="text-sm text-white/80">{submitError}</p>
              {needsReconnect && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConnectWallet}
                    className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#333] focus:outline-none"
                  >
                    Connect Wallet
                  </button>
                  <button
                    type="button"
                    onClick={handleReconnect}
                    className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white/90 hover:bg-[#333] focus:outline-none"
                  >
                    Sign in with Different Wallet
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label="Your Role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                options={[{ value: '', label: 'Select role' }, ...ROLES]}
                error={errors.role}
                required
                disabled={!authenticated}
              />
              <Select
                label="Network"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                options={[
                  { value: 'devnet', label: 'Devnet' },
                  { value: 'mainnet', label: 'Mainnet' },
                ]}
                disabled={!authenticated}
              />
            </div>

            {role === 'buyer' && (
              <div className="rounded-lg bg-[#1a1a1a] p-4">
                <p className="text-sm text-white/70">
                  <strong className="text-white/90">As a buyer:</strong> You need a deal link from the seller. 
                  The seller creates the deal and deposits tokens first, then shares the link with you.
                  Once you have the link, you can accept and settle the deal.
                </p>
              </div>
            )}

            {role === 'seller' && (
              <>
                <div className="rounded-lg bg-[#1a1a1a] p-4">
                  <p className="text-sm text-white/70">
                    <strong className="text-white/90">Your address:</strong>{' '}
                    {walletAddress ? formatPubkey(walletAddress) : 'Not connected'}
                  </p>
                  <p className="mt-1 text-sm text-white/70">
                    <strong className="text-white/90">You are:</strong> Seller (you will deposit base tokens into escrow)
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TokenInput
                    label="Base Token Mint (you sell)"
                    value={formData.baseMint}
                    onChange={(e) =>
                      setFormData({ ...formData, baseMint: e.target.value })
                    }
                    placeholder="Token mint address"
                    error={errors.baseMint}
                    required
                    disabled={!authenticated}
                  />
                  <Input
                    label="Base Amount"
                    value={formData.baseAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, baseAmount: e.target.value })
                    }
                    placeholder="Amount to sell"
                    type="number"
                    step="any"
                    error={errors.baseAmount}
                    required
                    disabled={!authenticated}
                  />
                  <TokenInput
                    label="Quote Token (buyer pays) - USDC only"
                    value={formData.quoteMint}
                    onChange={(e) => {
                      // Lock to USDC - prevent changes
                      const usdcMint = getUsdcMint(network);
                      setFormData({ ...formData, quoteMint: usdcMint });
                    }}
                    placeholder="USDC (locked)"
                    error={errors.quoteMint}
                    required
                    disabled={true}
                  />
                  <Input
                    label="Quote Amount"
                    value={formData.quoteAmount}
                    onChange={(e) =>
                      setFormData({ ...formData, quoteAmount: e.target.value })
                    }
                    placeholder="Price you want"
                    type="number"
                    step="any"
                    error={errors.quoteAmount}
                    required
                    disabled={!authenticated}
                  />
                  <Input
                    label="Buyer Address"
                    value={formData.counterparty}
                    onChange={(e) =>
                      setFormData({ ...formData, counterparty: e.target.value })
                    }
                    placeholder="Buyer's wallet public key"
                    error={errors.counterparty}
                    required
                    disabled={!authenticated}
                  />
                  <Input
                    label="Expiry (hours)"
                    value={formData.expiryHours}
                    onChange={(e) =>
                      setFormData({ ...formData, expiryHours: e.target.value })
                    }
                    placeholder="24"
                    type="number"
                    error={errors.expiryHours}
                    required
                    disabled={!authenticated}
                  />
                </div>

                <div className="rounded-lg bg-[#1a1a1a] p-4">
                  <h3 className="mb-3 text-sm font-semibold text-white">
                    Fee Preview (0.2% buyer only, success-only)
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-white/60">Fee (paid by buyer):</span>
                      <span className="font-medium text-white">
                        {formatNumber(fees.buyerFee)} {quoteSymbol}
                      </span>
                    </div>
                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-white/60">Buyer receives:</span>
                        <span className="text-base font-bold text-white">
                          {formatNumber(fees.buyerReceives)} {baseSymbol}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-white/60">Seller receives:</span>
                        <span className="text-base font-bold text-white">
                          {formatNumber(fees.sellerReceives)} {quoteSymbol}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-[#1a1a1a] p-4">
                  <h3 className="text-sm font-semibold text-white">
                    Before you proceed
                  </h3>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/70">
                    <li>Make sure you have the base tokens in your wallet</li>
                    <li>You need SOL for transaction fees (~0.01 SOL)</li>
                    <li>Tokens will be locked in escrow until buyer accepts or you cancel</li>
                    <li>You can cancel anytime before buyer accepts</li>
                  </ul>
                </div>
              </>
            )}

            {errors.auth && (
              <p className="text-sm text-white/70">{errors.auth}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!authenticated || !role || role === 'buyer' || isSubmitting}
                className="flex items-center gap-2 rounded-lg bg-[#2a2a2a] px-6 py-2 text-sm font-medium text-white hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Creating & Depositing...
                  </>
                ) : (
                  'Create & Deposit Escrow'
                )}
              </button>
            </div>
          </form>
          </Card>
        </div>
      </ScrollReveal>
    </div>
  );
}
