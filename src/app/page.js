'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import NumberFlow, { continuous } from '@number-flow/react';
import { usePrivy } from '@privy-io/react-auth';
import Input from '@/components/Input';
import Select from '@/components/Select';
import TokenInput from '@/components/TokenInput';
import ScrollReveal from '@/components/ScrollReveal';
import { formatDate } from '@/lib/format';

const SIZE_BUCKETS = [
  { value: 'S', label: 'S - Under $1k' },
  { value: 'M', label: 'M - $1k–$5k' },
  { value: 'L', label: 'L - $5k-25k' },
  { value: 'XL', label: 'XL - $25k+' },
];

const SIDES = [
  { value: 'BUY', label: 'BUY' },
  { value: 'SELL', label: 'SELL' },
];

const CONTACT_TYPES = [
  { value: 'twitter', label: 'Twitter' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'both', label: 'Twitter + Telegram' },
];

function truncateMint(mint) {
  if (!mint || mint.length < 12) return mint;
  return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

function formatStatNoDollar(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return `${num}`;
}

function formatVolume(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatContact(intent) {
  // Handle new format where contact might be "twitter|telegram" for both
  const contact = intent.contact || '';
  if (contact.includes('|')) {
    const [tw, tg] = contact.split('|');
    const twitter = tw ? `@${tw.trim().replace(/^@/, '')}` : '';
    const telegram = tg ? `t.me/${tg.trim().replace(/^@/, '').replace(/^t\.me\//, '')}` : '';
    return [twitter, telegram].filter(Boolean).join(' · ') || '—';
  }
  
  // Handle legacy format with contactType
  const t = intent.contactType || 'twitter';
  if (t === 'twitter') return contact ? `@${contact.replace(/^@/, '')}` : '—';
  if (t === 'telegram') return contact ? `t.me/${contact.replace(/^@/, '').replace(/^t\.me\//, '')}` : '—';
  if (t === 'both') {
    const tw = contact ? `@${contact.replace(/^@/, '')}` : '';
    const tg = intent.contactSecondary ? `t.me/${intent.contactSecondary.replace(/^@/, '').replace(/^t\.me\//, '')}` : '';
    return [tw, tg].filter(Boolean).join(' · ') || '—';
  }
  return contact || '—';
}

export default function IntentBoardPage() {
  const { ready, authenticated, user, login } = usePrivy();
  const [intents, setIntents] = useState([]);
  const [filteredIntents, setFilteredIntents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ side: '' });
  const [settledVolume, setSettledVolume] = useState(0);
  const [tokenMeta, setTokenMeta] = useState({});
  const requestedMints = useRef(new Set());
  const prevSettledVolume = useRef(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedTokenMint, setSelectedTokenMint] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const [formData, setFormData] = useState({
    tokenSymbol: '',
    tokenMint: '',
    side: 'BUY',
    sizeBucket: 'M',
    contactType: 'twitter',
    contact: '',
    contactSecondary: '',
  });

  const [errors, setErrors] = useState({});

  // Get wallet address for authenticated user
  const walletAddress = user?.wallet?.address;

  const onTokenInfo = useCallback((info) => {
    setFormData((prev) => ({ ...prev, tokenSymbol: info?.symbol ?? '' }));
  }, []);

  // Load intents from API
  const loadIntents = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/intents');
      if (response.ok) {
        const data = await response.json();
        // Convert createdAt from ISO string to timestamp if needed
        const intentsWithTimestamp = (data.intents || []).map(intent => ({
          ...intent,
          createdAt: intent.createdAt ? (typeof intent.createdAt === 'string' 
            ? Math.floor(new Date(intent.createdAt).getTime() / 1000)
            : intent.createdAt) : Date.now() / 1000
        }));
        setIntents(intentsWithTimestamp);
      } else {
        console.error('Failed to load intents');
        setIntents([]);
      }
    } catch (error) {
      console.error('Error loading intents:', error);
      setIntents([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIntents();
    // Poll for updates every 30 seconds
    const interval = setInterval(loadIntents, 30000);
    return () => clearInterval(interval);
  }, [loadIntents]);

  // Fetch settled volume and poll for updates
  const fetchSettledVolume = useCallback(() => {
    fetch('/api/deals?status=SETTLED')
      .then((r) => r.json())
      .then((d) => {
        const deals = d.deals || [];
        let vol = 0;
        deals.forEach((deal) => {
          const dec = deal.quoteDecimals ?? 6;
          vol += Number(deal.quoteAmount || 0) / Math.pow(10, dec);
        });
        setSettledVolume(vol);
      })
      .catch(() => setSettledVolume(0));
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchSettledVolume();
    
    // Poll every 5 seconds for updates
    const interval = setInterval(fetchSettledVolume, 5000);
    
    return () => clearInterval(interval);
  }, [fetchSettledVolume]);

  // Trigger animation when settled volume increases
  useEffect(() => {
    if (settledVolume > prevSettledVolume.current && prevSettledVolume.current > 0) {
      setIsAnimating(true);
      const timer = setTimeout(() => setIsAnimating(false), 1000);
      return () => clearTimeout(timer);
    }
    prevSettledVolume.current = settledVolume;
  }, [settledVolume]);

  useEffect(() => {
    let filtered = [...intents];
    const q = search.trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (i) =>
          (i.tokenSymbol && i.tokenSymbol.toLowerCase().includes(q)) ||
          (i.tokenMint && i.tokenMint.toLowerCase().includes(q))
      );
    }
    if (filters.side) filtered = filtered.filter((i) => i.side === filters.side);
    setFilteredIntents(filtered);
  }, [intents, search, filters]);

  const tokenList = useMemo(() => {
    const byMint = {};
    filteredIntents.forEach((i) => {
      const m = i.tokenMint;
      if (!m) return;
      if (!byMint[m]) byMint[m] = { mint: m, symbol: i.tokenSymbol || '—', buyCount: 0, sellCount: 0 };
      if (i.side === 'BUY') byMint[m].buyCount += 1;
      else if (i.side === 'SELL') byMint[m].sellCount += 1;
    });
    const list = Object.values(byMint);
    list.sort((a, b) => (b.buyCount + b.sellCount) - (a.buyCount + a.sellCount));
    return list;
  }, [filteredIntents]);

  const sortedMints = useMemo(() => tokenList.map((t) => t.mint), [tokenList]);

  useEffect(() => {
    sortedMints.forEach((mint) => {
      if (tokenMeta[mint] || requestedMints.current.has(mint)) return;
      requestedMints.current.add(mint);
      fetch(`/api/dexscreener/token/${mint}`)
        .then((r) => r.json())
        .then((data) => {
          setTokenMeta((prev) => ({ ...prev, [mint]: data }));
        })
        .catch(() => {})
        .finally(() => {
          requestedMints.current.delete(mint);
        });
    });
  }, [sortedMints, tokenMeta]);

  function validateForm() {
    const newErrors = {};
    if (!formData.tokenSymbol?.trim()) newErrors.tokenSymbol = 'Token symbol is required';
    if (!formData.tokenMint?.trim()) newErrors.tokenMint = 'Token mint is required';
    if (formData.contactType === 'both') {
      if (!formData.contact?.trim()) newErrors.contact = 'Twitter handle is required';
      if (!formData.contactSecondary?.trim()) newErrors.contactSecondary = 'Telegram handle is required';
    } else {
      if (!formData.contact?.trim()) newErrors.contact = 'Contact is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateForm()) return;

    // Check authentication
    if (!authenticated || !walletAddress) {
      setSubmitError('Please sign in to create an intent');
      login();
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Format contact based on contactType
      let contactValue = formData.contact.trim();
      if (formData.contactType === 'both') {
        contactValue = `${formData.contact.trim()}|${formData.contactSecondary.trim()}`;
      }

      const response = await fetch('/api/intents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenSymbol: formData.tokenSymbol.trim(),
          tokenMint: formData.tokenMint.trim(),
          side: formData.side,
          sizeBucket: formData.sizeBucket,
          contact: contactValue,
          creator: walletAddress,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 401) {
          setSubmitError('Please sign in to create an intent');
          login();
        } else if (response.status === 403) {
          setSubmitError(data.error || 'Maximum limit reached. You can have up to 7 active intents.');
        } else {
          setSubmitError(data.error || 'Failed to create intent. Please try again.');
        }
        setIsSubmitting(false);
        return;
      }

      // Success - reload intents and reset form
      await loadIntents();
      setShowForm(false);
      setFormData({
        tokenSymbol: '',
        tokenMint: '',
        side: 'BUY',
        sizeBucket: 'M',
        contactType: 'twitter',
        contact: '',
        contactSecondary: '',
      });
      setErrors({});
      setSubmitError('');
    } catch (error) {
      console.error('Error creating intent:', error);
      setSubmitError('Failed to create intent. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!id) return;
    
    // Check authentication
    if (!authenticated || !walletAddress) {
      return;
    }

    if (!confirm('Are you sure you want to delete this intent?')) {
      return;
    }

    try {
      const response = await fetch(`/api/intents?id=${id}&creator=${walletAddress}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to delete intent');
        return;
      }

      // Reload intents after deletion
      await loadIntents();
    } catch (error) {
      console.error('Error deleting intent:', error);
      alert('Failed to delete intent. Please try again.');
    }
  }

  const sorted = [...filteredIntents].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  const uniqueTokens = tokenList.length;
  const totalIntents = filteredIntents.length;

  const totalPages = Math.ceil(tokenList.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedTokens = tokenList.slice(startIndex, endIndex);

  const intentsForSelectedToken = useMemo(() => {
    if (!selectedTokenMint) return { buy: [], sell: [] };
    const forToken = filteredIntents.filter((i) => i.tokenMint === selectedTokenMint);
    const buy = forToken.filter((i) => i.side === 'BUY').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const sell = forToken.filter((i) => i.side === 'SELL').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return { buy, sell };
  }, [filteredIntents, selectedTokenMint]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters.side, itemsPerPage]);

  useEffect(() => {
    if (selectedTokenMint) setCurrentPage(1);
  }, [selectedTokenMint]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-playfair-display)] text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Markets
          </h1>
        </div>
      </ScrollReveal>

      <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
        <div className="mb-8 flex flex-wrap gap-x-12 gap-y-2">
          <div>
            <p className="text-sm text-white/50">Total settled</p>
            <div className={`mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl transition-colors duration-1000 ${
              isAnimating ? 'text-green-400' : ''
            }`}>
              <NumberFlow
                value={settledVolume}
                plugins={[continuous]}
                trend={1}
                format={{
                  style: 'currency',
                  currency: 'USD',
                  notation: 'compact',
                  maximumFractionDigits: 2,
                }}
                locales="en-US"
                transformTiming={{ duration: 800, easing: 'ease-out' }}
                spinTiming={{ duration: 800, easing: 'ease-out' }}
                opacityTiming={{ duration: 400, easing: 'ease-out' }}
              />
            </div>
          </div>
          <div>
            <p className="text-sm text-white/50">Tokens</p>
            <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
              {formatStatNoDollar(uniqueTokens)}
            </p>
          </div>
          <div>
            <p className="text-sm text-white/50">Total intents</p>
            <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
              {formatStatNoDollar(totalIntents)}
            </p>
          </div>
        </div>
      </ScrollReveal>

      {!selectedTokenMint && (
        <ScrollReveal transition={{ duration: 0.4, delay: 0.1 }}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="relative min-w-0 flex-1 max-w-md">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search asset name, symbol, or address"
                className="w-full rounded-lg bg-[#1a1a1a] py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-0"
              />
            </div>
            <div className="flex items-end gap-3 sm:shrink-0">
              <Select
                label="Side"
                value={filters.side}
                onChange={(e) => setFilters({ ...filters, side: e.target.value })}
                options={[{ value: '', label: 'All sides' }, ...SIDES]}
                className="max-w-[120px]"
              />
              <button
                type="button"
                onClick={() => {
                  if (!authenticated) {
                    login();
                    return;
                  }
                  setShowForm(!showForm);
                  setSubmitError('');
                }}
                className="rounded-lg bg-[#2a2a2a] px-3 py-2 text-xs font-medium text-white hover:bg-[#333] transition-colors focus:outline-none whitespace-nowrap"
              >
                {showForm ? 'Cancel' : '+ New Intent'}
              </button>
            </div>
          </div>
        </ScrollReveal>
      )}

      {showForm && !selectedTokenMint && (
        <div className="mt-6 rounded-xl bg-[#0d0d0d] p-6">
          <h2 className="mb-4 text-xl font-semibold text-white">Create New Intent</h2>
          {!authenticated && (
            <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-400">
              Please sign in to create an intent. You can have up to 7 active intents.
            </div>
          )}
          {submitError && (
            <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
              {submitError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <TokenInput
                label="Token Mint"
                value={formData.tokenMint}
                onChange={(e) => setFormData({ ...formData, tokenMint: e.target.value })}
                onTokenInfo={onTokenInfo}
                placeholder="Token mint address"
                error={errors.tokenMint}
                required
              />
              <Input
                label="Token Symbol"
                value={formData.tokenSymbol}
                onChange={(e) => setFormData({ ...formData, tokenSymbol: e.target.value })}
                placeholder="e.g. SOL, USDC"
                error={errors.tokenSymbol}
                required
              />
              <Select
                label="Side"
                value={formData.side}
                onChange={(e) => setFormData({ ...formData, side: e.target.value })}
                options={SIDES}
                required
              />
              <Select
                label="Size"
                value={formData.sizeBucket}
                onChange={(e) => setFormData({ ...formData, sizeBucket: e.target.value })}
                options={SIZE_BUCKETS}
                required
              />
              <Select
                label="Contact type"
                value={formData.contactType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    contactType: e.target.value,
                    contactSecondary: e.target.value === 'both' ? formData.contactSecondary : '',
                  })
                }
                options={CONTACT_TYPES}
                required
              />
              {formData.contactType === 'twitter' && (
                <Input
                  label="Twitter handle"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="@username"
                  error={errors.contact}
                  required
                />
              )}
              {formData.contactType === 'telegram' && (
                <Input
                  label="Telegram handle"
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="@username or t.me/username"
                  error={errors.contact}
                  required
                />
              )}
              {formData.contactType === 'both' && (
                <>
                  <Input
                    label="Twitter handle"
                    value={formData.contact}
                    onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                    placeholder="@username"
                    error={errors.contact}
                    required
                  />
                  <Input
                    label="Telegram handle"
                    value={formData.contactSecondary}
                    onChange={(e) => setFormData({ ...formData, contactSecondary: e.target.value })}
                    placeholder="@username or t.me/username"
                    error={errors.contactSecondary}
                    required
                  />
                </>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setErrors({});
                  setSubmitError('');
                }}
                className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white/90 hover:bg-[#333] focus:outline-none"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!authenticated || isSubmitting}
                className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#333] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Intent'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ScrollReveal transition={{ duration: 0.4, delay: 0.15 }}>
        <div className="mt-8">
          {selectedTokenMint ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedTokenMint(null)}
                  className="flex items-center gap-1.5 rounded-lg bg-[#2a2a2a] px-3 py-2 text-sm text-white/90 hover:bg-[#333] focus:outline-none"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to tokens
                </button>
                <div className="flex items-center gap-3">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#2a2a2a]">
                    {(tokenMeta[selectedTokenMint]?.imageUrl) ? (
                      <img src={tokenMeta[selectedTokenMint].imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-medium text-white">
                        {(intentsForSelectedToken.buy[0]?.tokenSymbol || intentsForSelectedToken.sell[0]?.tokenSymbol || '?').slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">
                      {intentsForSelectedToken.buy[0]?.tokenSymbol || intentsForSelectedToken.sell[0]?.tokenSymbol || 'Token'}
                    </h2>
                    <p className="text-xs font-mono text-white/50">{truncateMint(selectedTokenMint)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!authenticated) { login(); return; }
                    setShowForm(!showForm);
                    setSubmitError('');
                    if (!showForm) {
                      const sym = intentsForSelectedToken.buy[0]?.tokenSymbol || intentsForSelectedToken.sell[0]?.tokenSymbol || '';
                      setFormData((prev) => ({ ...prev, tokenMint: selectedTokenMint, tokenSymbol: sym }));
                    }
                  }}
                  className="ml-auto rounded-lg bg-[#2a2a2a] px-3 py-2 text-xs font-medium text-white hover:bg-[#333] transition-colors focus:outline-none"
                >
                  {showForm ? 'Cancel' : '+ New Intent'}
                </button>
              </div>
              {showForm && (
                <div className="mb-6 rounded-xl bg-[#0d0d0d] p-6">
                  <h2 className="mb-4 text-xl font-semibold text-white">Create New Intent</h2>
                  {!authenticated && (
                    <div className="mb-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-400">Please sign in to create an intent.</div>
                  )}
                  {submitError && <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">{submitError}</div>}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <TokenInput label="Token Mint" value={formData.tokenMint} onChange={(e) => setFormData({ ...formData, tokenMint: e.target.value })} onTokenInfo={onTokenInfo} placeholder="Token mint address" error={errors.tokenMint} required />
                      <Input label="Token Symbol" value={formData.tokenSymbol} onChange={(e) => setFormData({ ...formData, tokenSymbol: e.target.value })} placeholder="e.g. SOL" error={errors.tokenSymbol} required />
                      <Select label="Side" value={formData.side} onChange={(e) => setFormData({ ...formData, side: e.target.value })} options={SIDES} required />
                      <Select label="Size" value={formData.sizeBucket} onChange={(e) => setFormData({ ...formData, sizeBucket: e.target.value })} options={SIZE_BUCKETS} required />
                      <Select label="Contact type" value={formData.contactType} onChange={(e) => setFormData({ ...formData, contactType: e.target.value, contactSecondary: e.target.value === 'both' ? formData.contactSecondary : '' })} options={CONTACT_TYPES} required />
                      {formData.contactType === 'twitter' && <Input label="Twitter handle" value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} placeholder="@username" error={errors.contact} required />}
                      {formData.contactType === 'telegram' && <Input label="Telegram handle" value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} placeholder="@username or t.me/username" error={errors.contact} required />}
                      {formData.contactType === 'both' && (
                        <>
                          <Input label="Twitter handle" value={formData.contact} onChange={(e) => setFormData({ ...formData, contact: e.target.value })} placeholder="@username" error={errors.contact} required />
                          <Input label="Telegram handle" value={formData.contactSecondary} onChange={(e) => setFormData({ ...formData, contactSecondary: e.target.value })} placeholder="@username or t.me/username" error={errors.contactSecondary} required />
                        </>
                      )}
                    </div>
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => { setShowForm(false); setErrors({}); setSubmitError(''); }} className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white/90 hover:bg-[#333] focus:outline-none">Cancel</button>
                      <button type="submit" disabled={!authenticated || isSubmitting} className="rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#333] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed">{isSubmitting ? 'Creating...' : 'Create Intent'}</button>
                    </div>
                  </form>
                </div>
              )}
              <div className="space-y-6">
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] via-[#141414] to-[#050505] shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
                  <h3 className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs font-medium uppercase tracking-wide text-green-300">
                    <span>Offers to buy</span>
                    <span className="rounded-full bg-green-500/10 px-2.5 py-0.5 text-[11px] font-medium text-green-300">
                      {intentsForSelectedToken.buy.length} active
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="px-4 py-2 text-left text-xs font-medium uppercase text-white/60">Size</th>
                          <th className="px-4 py-2 text-left text-xs font-medium uppercase text-white/60">Contact</th>
                          <th className="px-4 py-2 text-right text-xs font-medium uppercase text-white/60">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium uppercase text-white/60" />
                        </tr>
                      </thead>
                      <tbody>
                        {intentsForSelectedToken.buy.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-sm text-white/50">No buy intents yet.</td>
                          </tr>
                        ) : (
                          intentsForSelectedToken.buy.map((intent) => {
                            const sizeLabel = SIZE_BUCKETS.find((b) => b.value === intent.sizeBucket)?.label || intent.sizeBucket || '—';
                            return (
                              <tr key={intent.id} className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03]">
                                <td className="px-4 py-3 text-sm text-white/80">{sizeLabel}</td>
                                <td className="px-4 py-3 text-sm text-white/70">{formatContact(intent)}</td>
                                <td className="px-4 py-3 text-right text-sm text-white/50">{intent.createdAt ? formatDate(intent.createdAt) : '—'}</td>
                                <td className="px-4 py-3 text-right">
                                  {authenticated && walletAddress && intent.creator === walletAddress && (
                                    <button type="button" onClick={() => handleDelete(intent.id)} className="rounded bg-[#2a2a2a] px-2 py-1 text-xs text-white/70 hover:bg-red-500/20 hover:text-white focus:outline-none">Delete</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.04] via-[#141414] to-[#050505] shadow-[0_18px_60px_rgba(0,0,0,0.7)]">
                  <h3 className="flex items-center justify-between border-b border-white/[0.06] bg-white/[0.02] px-4 py-3 text-xs font-medium uppercase tracking-wide text-red-300">
                    <span>Offers to sell</span>
                    <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-300">
                      {intentsForSelectedToken.sell.length} active
                    </span>
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="px-4 py-2 text-left text-xs font-medium uppercase text-white/60">Size</th>
                          <th className="px-4 py-2 text-left text-xs font-medium uppercase text-white/60">Contact</th>
                          <th className="px-4 py-2 text-right text-xs font-medium uppercase text-white/60">Date</th>
                          <th className="px-4 py-2 text-right text-xs font-medium uppercase text-white/60" />
                        </tr>
                      </thead>
                      <tbody>
                        {intentsForSelectedToken.sell.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-sm text-white/50">No sell intents yet.</td>
                          </tr>
                        ) : (
                          intentsForSelectedToken.sell.map((intent) => {
                            const sizeLabel = SIZE_BUCKETS.find((b) => b.value === intent.sizeBucket)?.label || intent.sizeBucket || '—';
                            return (
                              <tr key={intent.id} className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03]">
                                <td className="px-4 py-3 text-sm text-white/80">{sizeLabel}</td>
                                <td className="px-4 py-3 text-sm text-white/70">{formatContact(intent)}</td>
                                <td className="px-4 py-3 text-right text-sm text-white/50">{intent.createdAt ? formatDate(intent.createdAt) : '—'}</td>
                                <td className="px-4 py-3 text-right">
                                  {authenticated && walletAddress && intent.creator === walletAddress && (
                                    <button type="button" onClick={() => handleDelete(intent.id)} className="rounded bg-[#2a2a2a] px-2 py-1 text-xs text-white/70 hover:bg-red-500/20 hover:text-white focus:outline-none">Delete</button>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="mb-4 text-lg font-semibold text-white">Tokens</h2>
              <div className="overflow-hidden rounded-lg bg-[#141414]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Token</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">Market cap</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">Price</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">24h %</th>
                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-white/60">Buys</th>
                        <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-white/60">Sells</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTokens.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-12 text-center text-white/50">
                            No tokens found. Create an intent to get started.
                          </td>
                        </tr>
                      ) : (
                        paginatedTokens.map((t) => {
                          const meta = tokenMeta[t.mint] || {};
                          return (
                            <tr
                              key={t.mint}
                              onClick={() => setSelectedTokenMint(t.mint)}
                              className="group cursor-pointer border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.06]"
                            >
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-[#2a2a2a]">
                                    {meta.imageUrl ? (
                                      <img src={meta.imageUrl} alt="" className="h-full w-full object-cover" />
                                    ) : (
                                      <span className="flex h-full w-full items-center justify-center text-sm font-medium text-white">{(t.symbol || '?').slice(0, 2)}</span>
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium text-white">{t.symbol || '—'}</p>
                                    <p className="text-xs text-white/50 font-mono">{truncateMint(t.mint)}</p>
                                    <p className="mt-0.5 text-[11px] text-white/25 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                                      Click to view intents
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-sm text-white/80">
                                {meta.marketCap != null ? formatVolume(meta.marketCap) : '—'}
                              </td>
                              <td className="px-4 py-3 text-right font-mono text-sm text-white">
                                {meta.priceUsd != null ? `$${Number(meta.priceUsd) < 0.01 ? meta.priceUsd : meta.priceUsd.toFixed(4)}` : '—'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {meta.priceChange24h != null ? (
                                  <span className={meta.priceChange24h >= 0 ? 'text-white' : 'text-white/70'}>
                                    {meta.priceChange24h >= 0 ? '+' : ''}{meta.priceChange24h.toFixed(2)}%
                                  </span>
                                ) : (
                                  <span className="text-white/50">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center text-sm text-white/80">{t.buyCount}</td>
                              <td className="px-4 py-3 text-center text-sm text-white/80">{t.sellCount}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {tokenList.length > 0 && (
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-white/50">Items per page</span>
                    <Select
                      value={itemsPerPage.toString()}
                      onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                      options={[{ value: '10', label: '10' }, { value: '25', label: '25' }, { value: '50', label: '50' }]}
                      className="max-w-[80px]"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="rounded px-2 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30">Previous</button>
                    <span className="min-w-[7ch] px-2 py-1.5 text-center text-sm text-white/40">{currentPage} / {totalPages}</span>
                    <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="rounded px-2 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30">Next</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollReveal>
    </div>
  );
}
