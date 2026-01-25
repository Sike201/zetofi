'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth';
import ScrollReveal from '@/components/ScrollReveal';
import { getExplorerTxUrl } from '@/lib/solana';
import { formatDate } from '@/lib/format';

export default function HistoryPage() {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const walletAddress = user?.wallet?.address || wallets.find(w => w.walletClientType !== 'privy')?.address || wallets[0]?.address;

  useEffect(() => {
    if (!ready || !authenticated || !walletAddress) {
      setLoading(false);
      setDeals([]);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const [settledRes, cancelledRes] = await Promise.all([
          fetch('/api/deals?status=SETTLED'),
          fetch('/api/deals?status=CANCELLED'),
        ]);
        const settledData = await settledRes.json();
        const cancelledData = await cancelledRes.json();
        const settled = settledData.deals || [];
        const cancelledList = cancelledData.deals || [];
        const all = [...settled, ...cancelledList];
        const mine = all.filter(
          (d) => d.seller === walletAddress || d.buyer === walletAddress
        );
        mine.sort((a, b) => {
          const aTs = a.updatedAt || a.createdAt || 0;
          const bTs = b.updatedAt || b.createdAt || 0;
          return (typeof bTs === 'string' ? new Date(bTs).getTime() : bTs) - (typeof aTs === 'string' ? new Date(aTs).getTime() : aTs);
        });
        if (!cancelled) {
          setDeals(mine);
          setCurrentPage(1);
        }
      } catch (e) {
        if (!cancelled) setDeals([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [ready, authenticated, walletAddress]);

  const ts = (d) => d.updatedAt || d.createdAt;
  const truncateId = (id) => {
    if (!id || id.length <= 24) return id || '—';
    return `${id.slice(0, 12)}…${id.slice(-8)}`;
  };

  // Pagination
  const totalPages = Math.ceil(deals.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedDeals = deals.slice(startIndex, endIndex);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <ScrollReveal>
        <div className="mb-8">
          <h1 className="font-[family-name:var(--font-playfair-display)] text-5xl font-semibold tracking-tight text-white sm:text-6xl">
            History
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Your previous successful transactions (settled & cancelled deals).
          </p>
        </div>
      </ScrollReveal>

      {!ready || !authenticated ? (
        <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
          <div className="rounded-xl bg-[#0d0d0d] p-8 text-center">
            <p className="text-white/70">Log in to view your transaction history.</p>
          </div>
        </ScrollReveal>
      ) : loading ? (
        <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
          <div className="flex items-center justify-center rounded-xl bg-[#0d0d0d] py-16">
            <svg className="h-8 w-8 animate-spin text-white/60" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="ml-3 text-white/70">Loading…</span>
          </div>
        </ScrollReveal>
      ) : deals.length === 0 ? (
        <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
          <div className="rounded-xl bg-[#0d0d0d] p-8 text-center">
            <p className="text-white/70">No settled or cancelled deals yet.</p>
            <Link
              href="/settle"
              className="mt-4 inline-block rounded-lg bg-[#2a2a2a] px-4 py-2 text-sm font-medium text-white hover:bg-[#333]"
            >
              Go to Settle
            </Link>
          </div>
        </ScrollReveal>
      ) : (
        <ScrollReveal transition={{ duration: 0.4, delay: 0.05 }}>
          <div className="overflow-hidden rounded-lg bg-[#141414]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="border-b border-white/[0.06]">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Deal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-white/60">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-white/60" />
                  </tr>
                </thead>
                <tbody>
                  {paginatedDeals.map((d) => (
                    <tr
                      key={d.id}
                      className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm text-white/90">{truncateId(d.id)}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-white/80">
                        {d.seller === walletAddress ? 'Seller' : 'Buyer'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                            d.status === 'SETTLED'
                              ? 'border-white/40 bg-white/10 text-white'
                              : 'border-white/20 bg-white/5 text-white/70'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-white/70">
                        {ts(d) ? formatDate(typeof ts(d) === 'string' ? new Date(ts(d)).getTime() / 1000 : ts(d)) : '—'}
                      </td>
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
                              href={getExplorerTxUrl(d.txSignature, d.network || 'devnet')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-[#2a2a2a] px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-[#333] hover:text-white"
                            >
                              View on Solscan
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Pagination Controls */}
          {deals.length > 0 && (
            <div className="mt-4 flex items-center justify-end gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="rounded px-2 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
              >
                Previous
              </button>
              <span className="min-w-[7ch] px-2 py-1.5 text-center text-sm text-white/40">
                {currentPage} / {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages || 1, p + 1))}
                disabled={currentPage >= totalPages}
                className="rounded px-2 py-1.5 text-sm text-white/50 hover:bg-white/[0.06] hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </ScrollReveal>
      )}
    </div>
  );
}
