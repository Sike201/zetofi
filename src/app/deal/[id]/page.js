'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets as useSolanaWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import Card from '@/components/Card';
import DisclaimerBanner from '@/components/DisclaimerBanner';
import { formatPubkey, getExplorerTxUrl } from '@/lib/solana';
import { formatNumber, formatDate } from '@/lib/format';
import { fetchDealOnChain, DealStatusLabels, FEE_BPS } from '@/lib/escrow';
import { acceptAndSettle, cancelDeal, getTokenDecimals } from '@/lib/escrowClient';

export default function DealPage() {
  const params = useParams();
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  // Use Solana-specific wallet hook for proper signing support
  const { wallets: solanaWallets, ready: walletsReady } = useSolanaWallets();
  const { signTransaction } = useSignTransaction();
  
  const [deal, setDeal] = useState(null);
  const [onChainData, setOnChainData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const [tokenDecimals, setTokenDecimals] = useState({ base: 9, quote: 9 });

  // Get wallet address from user.wallet (always available when authenticated)
  const walletAddress = user?.wallet?.address;
  
  // Get active Solana wallet from useSolanaWallets
  const activeWallet = solanaWallets.find(w => w.address === walletAddress) || solanaWallets[0] || null;
  
  const dealId = params.id;

  // Function to get signing method using Privy's Solana signTransaction hook
  function getSigningMethod() {
    // Use Privy's signTransaction hook with the ConnectedStandardSolanaWallet
    if (activeWallet && signTransaction) {
      return { type: 'privy', wallet: activeWallet, signTransaction };
    }
    
    return null;
  }

  const loadDeal = useCallback(async () => {
    if (!dealId) return;
    
    setLoading(true);
    try {
      // Fetch from API
      const response = await fetch(`/api/deals/${dealId}`);
      if (response.ok) {
        const { deal: apiDeal } = await response.json();
        setDeal(apiDeal);

        // Use stored decimals if available, otherwise fetch from chain
        if (apiDeal.baseDecimals !== undefined && apiDeal.quoteDecimals !== undefined) {
          setTokenDecimals({ 
            base: apiDeal.baseDecimals, 
            quote: apiDeal.quoteDecimals 
          });
        } else if (apiDeal.baseMint && apiDeal.quoteMint) {
          // Fetch decimals from chain for older deals
          const network = apiDeal.network || 'devnet';
          const [baseDecimals, quoteDecimals] = await Promise.all([
            getTokenDecimals(apiDeal.baseMint, network),
            getTokenDecimals(apiDeal.quoteMint, network),
          ]);
          setTokenDecimals({ base: baseDecimals, quote: quoteDecimals });
        }

        // Fetch on-chain data if deal exists
        if (apiDeal && apiDeal.status !== 'PENDING') {
          const chainData = await fetchDealOnChain(dealId, apiDeal.network || 'devnet');
          setOnChainData(chainData);
        }
      } else {
        // Fallback to localStorage for legacy deals
        const stored = localStorage.getItem('zeto_deals');
        if (stored) {
          const deals = JSON.parse(stored);
          if (deals[dealId]) {
            setDeal(deals[dealId]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading deal:', error);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    loadDeal();
  }, [loadDeal]);

  function handleCopyLink() {
    const url = `${window.location.origin}/deal/${dealId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleAcceptAndSettle() {
    if (!deal || !authenticated) return;
    
    const signingMethod = getSigningMethod();
    if (!signingMethod) {
      setActionError('No wallet with signing capability found. Please connect a Solana wallet.');
      return;
    }
    
    setIsProcessing(true);
    setActionError('');
    setTxSignature('');

    try {
      const { signature } = await acceptAndSettle({
        signingMethod,
        dealIdString: dealId,
        dealData: deal,
        network: deal.network || 'devnet',
      });

      setTxSignature(signature);

      // Hide Accept & Settle / Cancel immediately (before PATCH) so UI updates as soon as tx succeeds
      setDeal((prev) => (prev ? { ...prev, status: 'SETTLED' } : null));
      setOnChainData((prev) => (prev ? { ...prev, statusLabel: 'SETTLED' } : null));

      try {
        await fetch(`/api/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'SETTLED', txSignature: signature }),
        });
      } finally {
        /* ignore PATCH errors for UI; on-chain tx already succeeded */
      }
      await loadDeal();
    } catch (error) {
      console.error('Settlement error:', error);
      setActionError(error.message || 'Failed to settle deal');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleCancel() {
    if (!deal || !authenticated) return;
    
    const signingMethod = getSigningMethod();
    if (!signingMethod) {
      setActionError('No wallet with signing capability found. Please connect a Solana wallet.');
      return;
    }
    
    if (!confirm('Cancel this deal? Tokens will be returned to seller.')) return;

    setIsProcessing(true);
    setActionError('');
    setTxSignature('');

    try {
      const { signature } = await cancelDeal({
        signingMethod,
        dealIdString: dealId,
        dealData: deal,
        network: deal.network || 'devnet',
      });

      setTxSignature(signature);

      // Hide Cancel immediately (before PATCH) so UI updates as soon as tx succeeds
      setDeal((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
      setOnChainData((prev) => (prev ? { ...prev, statusLabel: 'CANCELLED' } : null));

      try {
        await fetch(`/api/deals/${dealId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'CANCELLED', txSignature: signature }),
        });
      } finally {
        /* ignore PATCH errors for UI; on-chain tx already succeeded */
      }
      await loadDeal();
    } catch (error) {
      console.error('Cancel error:', error);
      setActionError(error.message || 'Failed to cancel deal');
    } finally {
      setIsProcessing(false);
    }
  }

  // Determine actual status: prefer API (deal.status) when it's terminal, else on-chain label
  const apiStatus = (deal?.status || '').toUpperCase();
  const isTerminalFromApi = apiStatus === 'SETTLED' || apiStatus === 'CANCELLED';
  const actualStatus = isTerminalFromApi ? apiStatus : (onChainData?.statusLabel || deal?.status || 'UNKNOWN');
  const actualStatusUpper = (actualStatus || '').toUpperCase();

  const isExpired = deal && deal.expiryTs && deal.expiryTs < Math.floor(Date.now() / 1000);
  const isSeller = deal && authenticated && walletAddress === deal.seller;
  const isBuyer = deal && authenticated && walletAddress === deal.buyer;
  const isParticipant = isSeller || isBuyer;

  // Action availability — hide Accept & Cancel once deal is settled/cancelled or we just completed one of those actions
  const canBuyerAccept = isBuyer && actualStatusUpper === 'FUNDED' && !isExpired;
  const canSellerCancel = isSeller && (actualStatusUpper === 'INITIALIZED' || actualStatusUpper === 'FUNDED');
  const justCompletedAcceptOrCancel = !!txSignature && !isProcessing;
  const hideAcceptAndCancel =
    actualStatusUpper === 'SETTLED' || actualStatusUpper === 'CANCELLED' || justCompletedAcceptOrCancel;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <div className="flex items-center justify-center py-8">
            <svg className="h-8 w-8 animate-spin text-white/60" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="ml-3 text-white/70">Loading deal...</span>
          </div>
        </Card>
      </div>
    );
  }

  if (!deal) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Card>
          <div className="py-8 text-center">
            <p className="mb-4 text-white/80">Deal not found</p>
            <button
              onClick={() => router.push('/settle')}
              className="rounded-lg border border-white bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90"
            >
              Create New Deal
            </button>
          </div>
        </Card>
      </div>
    );
  }

  // Parse amounts using actual token decimals
  const baseAmountDisplay = parseFloat(deal.baseAmount) / Math.pow(10, tokenDecimals.base);
  const quoteAmountDisplay = parseFloat(deal.quoteAmount) / Math.pow(10, tokenDecimals.quote);
  
  const buyerFee = quoteAmountDisplay * (FEE_BPS / 10000);
  const sellerFee = 0;
  const buyerReceives = baseAmountDisplay;
  const sellerReceives = quoteAmountDisplay - buyerFee;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Deal Details</h1>
      </div>

      <DisclaimerBanner variant="settlement" />

      {onChainData && (
        <div className="mt-4 rounded-lg border border-white/20 bg-white/[0.03] p-4">
          <div className="flex items-center">
            <svg className="mr-2 h-5 w-5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm font-medium text-white/90">On-chain escrow verified</span>
          </div>
          <p className="mt-1 font-mono text-xs text-white/60">PDA: {formatPubkey(onChainData.pda, 8)}</p>
        </div>
      )}

      <div className="mt-8 space-y-6">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Deal Terms</h2>
              <p className="mt-1 font-mono text-sm text-white/50">{dealId}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-sm font-medium ${
                  actualStatusUpper === 'SETTLED'
                    ? 'border-white/40 bg-white/10 text-white'
                    : actualStatusUpper === 'CANCELLED'
                    ? 'border-white/20 bg-white/5 text-white/70'
                    : actualStatusUpper === 'FUNDED'
                    ? 'border-green-500/50 bg-green-500/10 text-green-400'
                    : actualStatusUpper === 'INITIALIZED'
                    ? 'border-white/25 bg-white/5 text-white/80'
                    : isExpired
                    ? 'border-white/20 bg-white/5 text-white/60'
                    : 'border-white/20 bg-white/5 text-white/80'
                }`}
              >
                {actualStatus}
                {isExpired && actualStatusUpper !== 'SETTLED' && actualStatusUpper !== 'CANCELLED' ? ' (Expired)' : ''}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-white/70">Seller</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {formatPubkey(deal.seller, 6)}
                </p>
                {isSeller && (
                  <span className="mt-1 inline-block rounded border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/80">
                    You
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white/70">Buyer</p>
                <p className="mt-1 font-mono text-sm text-white">
                  {formatPubkey(deal.buyer, 6)}
                </p>
                {isBuyer && (
                  <span className="mt-1 inline-block rounded border border-white/20 bg-white/5 px-2 py-1 text-xs text-white/80">
                    You
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-white/20 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-white">Base Token (Seller sells)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Mint:</span>
                  <span className="font-mono text-xs text-white">
                    {formatPubkey(deal.baseMint, 8)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Amount:</span>
                  <span className="font-medium text-white">{formatNumber(baseAmountDisplay)}</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/20 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-white">Quote Token (Buyer pays)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Mint:</span>
                  <span className="font-mono text-xs text-white">
                    {formatPubkey(deal.quoteMint, 8)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/60">Amount:</span>
                  <span className="font-medium text-white">{formatNumber(quoteAmountDisplay)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-white/20 bg-white/[0.03] p-4">
              <h3 className="mb-3 text-sm font-semibold text-white">Fees & Net Amounts (0.2% buyer only)</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/60">Fee (paid by buyer):</span>
                  <span className="font-medium text-white">
                    {formatNumber(buyerFee)} (from quote)
                  </span>
                </div>
                {onChainData?.feeRecipient && (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                      <span className="text-white/60">Fees go to:</span>
                      <span className="font-mono text-xs text-white/80 break-all text-right">
                        {onChainData.feeRecipient}
                      </span>
                    </div>
                    <p className="text-xs text-white/50">
                      Fee is sent in the quote token (e.g. USDC) to this address. Check the same network ({deal?.network || 'devnet'}) as the deal.
                    </p>
                  </>
                )}
                <div className="mt-3 border-t border-white/20 pt-2">
                  <div className="flex justify-between">
                    <span className="text-white/60">Buyer receives:</span>
                    <span className="font-semibold text-white">
                      {formatNumber(buyerReceives)} base tokens
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/60">Seller receives:</span>
                    <span className="font-semibold text-white">
                      {formatNumber(sellerReceives)} quote tokens
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-white/20 pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-white/70">Expiry</p>
                  <p className="mt-1 text-sm text-white">{formatDate(deal.expiryTs)}</p>
                  {isExpired && (
                    <p className="mt-1 text-xs text-white/60">This deal has expired</p>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-white/70">Network</p>
                  <p className="mt-1 capitalize text-sm text-white">{deal.network || 'devnet'}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          {actionError && (
            <div className="mb-4 rounded-lg border border-white/30 bg-white/[0.04] p-3">
              <p className="text-sm text-white/80">{actionError}</p>
            </div>
          )}

          {txSignature && (
            <div className="mb-4 rounded-lg border border-white/20 bg-white/[0.03] p-3">
              <p className="text-sm text-white/80">
                Transaction successful!{' '}
                <a
                  href={getExplorerTxUrl(txSignature, deal?.network || 'devnet')}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white"
                >
                  View on Solscan
                </a>
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCopyLink}
              className="rounded-lg border border-white/40 px-4 py-2 text-sm font-medium text-white/80 hover:bg-white/10"
            >
              {copied ? 'Copied!' : 'Copy Deal Link'}
            </button>

            {!hideAcceptAndCancel && canBuyerAccept && (
              <button
                onClick={handleAcceptAndSettle}
                disabled={isProcessing}
                className="flex items-center gap-2 rounded-lg border border-white bg-white px-4 py-2 text-sm font-medium text-black hover:bg-white/90 disabled:cursor-not-allowed disabled:border-white/20 disabled:bg-white/10 disabled:text-white/50"
              >
                {isProcessing ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Accept & Settle'
                )}
              </button>
            )}

            {!hideAcceptAndCancel && canSellerCancel && (
              <button
                onClick={handleCancel}
                disabled={isProcessing}
                className="flex items-center gap-2 rounded-lg border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Cancel Deal'
                )}
              </button>
            )}

            {!authenticated && (
              <p className="self-center text-sm text-white/60">Login to interact with this deal</p>
            )}

            {authenticated && !isParticipant && (
              <p className="self-center text-sm text-white/60">You are not a participant in this deal</p>
            )}

            {authenticated && isParticipant && actualStatusUpper === 'SETTLED' && (
              <p className="self-center text-sm text-white/80">✓ This deal has been settled</p>
            )}

            {authenticated && isParticipant && actualStatusUpper === 'CANCELLED' && (
              <p className="self-center text-sm text-white/60">This deal was cancelled</p>
            )}

            {authenticated && isBuyer && actualStatusUpper === 'FUNDED' && isExpired && (
              <p className="self-center text-sm text-white/60">This deal has expired. Seller can reclaim funds.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
