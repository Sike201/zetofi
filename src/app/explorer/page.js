'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import ScrollReveal from '@/components/ScrollReveal';
import { getExplorerTxUrl } from '@/lib/solana';
import { formatDate, formatNumber } from '@/lib/format';

const SPARKLINE_WIDTH = 88;
const SPARKLINE_HEIGHT = 36;
const SPARKLINE_PAD = 6;

function truncateMint(mint) {
  if (!mint || mint.length < 12) return mint || '—';
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`;
}

const NETWORK = 'devnet';
const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'SETTLED', label: 'Settled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'PENDING', label: 'Ongoing' },
];

function truncateId(id) {
  if (!id || id.length <= 24) return id || '—';
  return `${id.slice(0, 12)}…${id.slice(-8)}`;
}

export default function ExplorerPage() {
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch('/api/deals');
        const data = await res.json();
        const all = (data.deals || []).filter((d) => (d.network || 'devnet') === NETWORK);
        all.sort((a, b) => {
          const aTs = a.updatedAt || a.createdAt || 0;
          const bTs = b.updatedAt || b.createdAt || 0;
          const aVal = typeof aTs === 'string' ? new Date(aTs).getTime() : aTs;
          const bVal = typeof bTs === 'string' ? new Date(bTs).getTime() : bTs;
          return bVal - aVal;
        });
        if (!cancelled) setDeals(all);
      } catch (e) {
        if (!cancelled) setDeals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const nowSec = Math.floor(Date.now() / 1000);
  const isDealExpired = (d) => d.expiryTs != null && Number(d.expiryTs) < nowSec;

  const devnetDeals = deals;
  const settled = devnetDeals.filter((d) => (d.status || '').toUpperCase() === 'SETTLED');
  const cancelled = devnetDeals.filter((d) => (d.status || '').toUpperCase() === 'CANCELLED');
  const pendingAll = devnetDeals.filter((d) => (d.status || '').toUpperCase() === 'PENDING');
  const pending = pendingAll.filter((d) => !isDealExpired(d));

  const settledVolume = settled.reduce((sum, d) => {
    const dec = d.quoteDecimals ?? 6;
    return sum + Number(d.quoteAmount || 0) / Math.pow(10, dec);
  }, 0);

  // Chart: settlement value over time (cumulative by day)
  const chartData = useMemo(() => {
    const byDay = new Map();
    settled.forEach((d) => {
      const ts = d.updatedAt || d.createdAt;
      const ms = typeof ts === 'string' ? new Date(ts).getTime() : (ts && ts < 10000000000 ? ts * 1000 : ts) || 0;
      const dayKey = new Date(ms).toISOString().slice(0, 10);
      const dec = d.quoteDecimals ?? 6;
      const value = Number(d.quoteAmount || 0) / Math.pow(10, dec);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + value);
    });
    const sorted = Array.from(byDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, daily]) => ({ date, daily }));
    let cum = 0;
    return sorted.map(({ date, daily }) => {
      cum += daily;
      return { date, daily, cumulative: cum };
    });
  }, [settled]);

  const filtered =
    statusFilter === ''
      ? devnetDeals
      : devnetDeals.filter((d) => {
          const statusUpper = (d.status || '').toUpperCase();
          if (statusUpper !== statusFilter) return false;
          if (statusFilter === 'PENDING') return !isDealExpired(d);
          return true;
        });

  const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedDeals = filtered.slice(startIndex, startIndex + itemsPerPage);

  const total = devnetDeals.length;
  const totalForBar = settled.length + cancelled.length + pending.length;
  const settledPct = totalForBar ? (settled.length / totalForBar) * 100 : 0;
  const cancelledPct = totalForBar ? (cancelled.length / totalForBar) * 100 : 0;
  const pendingPct = totalForBar ? (pending.length / totalForBar) * 100 : 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-playfair-display)] text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            Explorer
          </h1>
          <p className="mt-2 text-sm text-white/50">
            All settlements on devnet — completed, cancelled, and ongoing.
          </p>
        </div>
      </ScrollReveal>

      {loading ? (
        <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
          <div className="flex items-center justify-center rounded-xl bg-[#0d0d0d] py-16">
            <svg className="h-8 w-8 animate-spin text-white/60" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="ml-3 text-white/70">Loading…</span>
          </div>
        </ScrollReveal>
      ) : (
        <>
          {/* Stats row */}
          <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
            <div className="mb-8 flex flex-wrap gap-x-12 gap-y-6">
              <div>
                <p className="text-sm text-white/70">Total deals</p>
                <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
                  {formatNumber(total, 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/70">Settled</p>
                <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
                  {formatNumber(settled.length, 0)}
                </p>
                <p className="mt-0.5 text-xs text-white/50">Quote vol: {formatNumber(settledVolume, 2)}</p>
              </div>
              <div>
                <p className="text-sm text-white/70">Cancelled</p>
                <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
                  {formatNumber(cancelled.length, 0)}
                </p>
              </div>
              <div>
                <p className="text-sm text-white/70">Ongoing</p>
                <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
                  {formatNumber(pending.length, 0)}
                </p>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <p className="text-sm text-white/70">Success rate</p>
                  <p className="mt-0.5 font-[family-name:var(--font-playfair-display)] text-2xl font-semibold text-white sm:text-3xl">
                    {total ? formatNumber((settled.length / total) * 100, 1) : 0}%
                  </p>
                  <p className="mt-0.5 text-xs text-white/50">Settled / total</p>
                </div>
                {chartData.length > 0 && (
                  <svg
                    width={SPARKLINE_WIDTH}
                    height={SPARKLINE_HEIGHT}
                    className="shrink-0"
                    aria-hidden
                  >
                    <defs>
                      <linearGradient id="explorer-sparkline-gradient" x1="0" x2="1" y1="0" y2="0">
                        <stop offset="0%" stopColor="rgb(34 197 94)" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="rgb(34 197 94)" stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    {(() => {
                      const w = SPARKLINE_WIDTH;
                      const h = SPARKLINE_HEIGHT;
                      const pad = SPARKLINE_PAD;
                      const chartW = w - pad * 2;
                      const chartH = h - pad * 2;
                      const n = chartData.length;
                      const maxVal = Math.max(1, ...chartData.map((d) => d.cumulative));
                      const x = (i) => pad + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
                      const y = (v) => pad + chartH - (v / maxVal) * chartH;
                      const points = chartData.map((d, i) => `${x(i)},${y(d.cumulative)}`);
                      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p}`).join(' ');
                      return (
                        <path
                          d={linePath}
                          fill="none"
                          stroke="url(#explorer-sparkline-gradient)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          </ScrollReveal>

          {/* Status breakdown bar */}
          <ScrollReveal transition={{ duration: 0.4, delay: 0.08 }}>
            <div className="mb-8">
              <p className="mb-2 text-sm font-medium text-white/60">Status breakdown</p>
              <div className="flex h-8 w-full overflow-hidden rounded-lg bg-[#141414] border border-white/[0.06]">
                {settled.length > 0 && (
                  <div
                    className="bg-green-500/25 border-r border-white/10 flex items-center justify-center min-w-[40px]"
                    style={{ width: `${settledPct}%` }}
                    title={`Settled: ${settled.length}`}
                  >
                    {settledPct >= 15 && (
                      <span className="text-xs font-medium text-green-300">{settled.length}</span>
                    )}
                  </div>
                )}
                {cancelled.length > 0 && (
                  <div
                    className="bg-red-500/20 border-r border-white/10 flex items-center justify-center min-w-[40px]"
                    style={{ width: `${cancelledPct}%` }}
                    title={`Cancelled: ${cancelled.length}`}
                  >
                    {cancelledPct >= 15 && (
                      <span className="text-xs font-medium text-red-300">{cancelled.length}</span>
                    )}
                  </div>
                )}
                {pending.length > 0 && (
                  <div
                    className="bg-amber-500/20 flex items-center justify-center min-w-[40px]"
                    style={{ width: `${pendingPct}%` }}
                    title={`Ongoing: ${pending.length}`}
                  >
                    {pendingPct >= 15 && (
                      <span className="text-xs font-medium text-amber-300">{pending.length}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-xs text-white/50">
                <span className="flex items-center gap-1.5 text-green-400/90">
                  <span className="h-2 w-2 rounded-full bg-green-500/60" /> Settled
                </span>
                <span className="flex items-center gap-1.5 text-red-400/80">
                  <span className="h-2 w-2 rounded-full bg-red-500/60" /> Cancelled
                </span>
                <span className="flex items-center gap-1.5 text-amber-400/90">
                  <span className="h-2 w-2 rounded-full bg-amber-500/60" /> Ongoing
                </span>
              </div>
            </div>
          </ScrollReveal>

          {/* Table */}
          <ScrollReveal transition={{ duration: 0.4, delay: 0.1 }}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">Deals</h2>
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/50">Status:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg bg-[#1a1a1a] border border-white/[0.08] px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-white/30"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl bg-[#0d0d0d] p-8 text-center">
                <p className="text-white/60">No devnet deals found.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl bg-[#141414] border border-white/[0.06]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Deal</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Token</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">Size</th>
                        <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">Date</th>
                        <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60" />
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedDeals.map((d) => {
                        const ts = d.updatedAt || d.createdAt;
                        const tsFormatted = ts
                          ? formatDate(typeof ts === 'string' ? new Date(ts).getTime() / 1000 : ts)
                          : '—';
                        const statusUpper = (d.status || '').toUpperCase();
                        const baseDec = d.baseDecimals ?? 9;
                        const size = Number(d.baseAmount || 0) / Math.pow(10, baseDec);
                        return (
                          <tr
                            key={d.id}
                            className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03]"
                          >
                            <td className="px-4 py-3">
                              <span className="font-mono text-sm text-white/90">{truncateId(d.id)}</span>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-white/80" title={d.baseMint}>
                              {truncateMint(d.baseMint)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm text-white/80">
                              {formatNumber(size, 2)}
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const isExp = statusUpper === 'PENDING' && isDealExpired(d);
                                const label = isExp ? 'Expired' : d.status;
                                const style =
                                  statusUpper === 'SETTLED'
                                    ? 'border-green-500/40 bg-green-500/10 text-green-300'
                                    : statusUpper === 'CANCELLED'
                                    ? 'border-red-500/40 bg-red-500/10 text-red-300'
                                    : isExp
                                    ? 'border-white/20 bg-white/5 text-white/60'
                                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300';
                                return (
                                  <span
                                    className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}
                                  >
                                    {label}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-white/70">{tsFormatted}</td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Link
                                  href={`/deal/${d.id}`}
                                  className="rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#333]"
                                >
                                  View deal
                                </Link>
                                {d.txSignature && (
                                  <a
                                    href={getExplorerTxUrl(d.txSignature, d.network || NETWORK)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-[#333] hover:text-white"
                                  >
                                    Solscan
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length > itemsPerPage && (
                  <div className="flex items-center justify-end gap-1 border-t border-white/[0.06] px-4 py-3">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded px-2 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
                    >
                      Previous
                    </button>
                    <span className="min-w-[7ch] px-2 py-1.5 text-center text-sm text-white/40">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                      className="rounded px-2 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            )}
          </ScrollReveal>
        </>
      )}
    </div>
  );
}
