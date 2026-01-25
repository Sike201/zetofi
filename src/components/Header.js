'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { formatPubkey } from '@/lib/solana';

function NavLink({ href, children, active, mobile }) {
  return (
    <Link
      href={href}
      className={`relative py-2 text-sm font-medium transition-colors hover:text-white ${active ? 'text-white' : 'text-white/60'} ${mobile ? 'block py-3 border-b border-white/[0.06] last:border-b-0' : ''}`}
    >
      {children}
      {!mobile && (
        <motion.span
          className="absolute bottom-0 left-0 right-0 h-px bg-white"
          initial={false}
          animate={{ scaleX: active ? 1 : 0 }}
          whileHover={{ scaleX: 1 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ transformOrigin: 'left' }}
        />
      )}
    </Link>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const connectedWallet = wallets.find(w => w.walletClientType !== 'privy') || wallets[0] || null;
  const walletAddress = connectedWallet?.address || user?.wallet?.address;
  const isSettle = pathname?.startsWith('/settle');
  const isHistory = pathname?.startsWith('/history');

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (ready) {
      console.log('🔍 Privy State Debug:');
      console.log('- Privy ready:', ready);
      console.log('- Authenticated:', authenticated);
      console.log('- Connected wallets:', wallets.length);
      if (wallets.length > 0) {
        console.log('- Wallet details:', wallets.map(w => ({
          name: w.name || w.walletClientType,
          address: w.address,
          chainId: w.chainId,
        })));
      }
      if (authenticated) {
        console.log('- User wallet:', user?.wallet);
        console.log('- Linked accounts:', user?.linkedAccounts);
      } else {
        console.log('💡 Click "Login" to see available wallets in the Privy modal');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated, wallets.length]);

  return (
    <header className="bg-black">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:px-16">
        <div className="flex min-w-0 flex-1 items-center gap-10 lg:gap-16">
          <Link href="/" className="relative flex shrink-0 items-center" aria-label="Zeto home">
            <img
              src="/zetologo.png"
              alt="Zeto"
              width={100}
              height={28}
              className="h-6 w-auto min-h-[24px] object-contain object-left sm:h-7 sm:min-h-[28px]"
            />
          </Link>
          <nav className="hidden items-center gap-10 md:flex lg:gap-16">
            <NavLink href="/" active={!isSettle && !isHistory}>
              Markets
            </NavLink>
            <NavLink href="/settle" active={!!isSettle}>
              Settle
            </NavLink>
            <NavLink href="/history" active={!!isHistory}>
              History
            </NavLink>
          </nav>
        </div>

        {/* Desktop auth */}
        <div className="hidden shrink-0 items-center gap-3 md:flex lg:gap-4">
          {ready && authenticated && walletAddress && (
            <span className="max-w-[140px] truncate text-sm font-mono text-white/70 lg:max-w-[180px]">
              {formatPubkey(walletAddress)}
            </span>
          )}
          {ready && !authenticated && (
            <button
              onClick={login}
              className="rounded-md border border-white px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white hover:text-black focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              Login
            </button>
          )}
          {ready && authenticated && (
            <button
              onClick={logout}
              className="rounded-md border border-white/40 px-4 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
            >
              Logout
            </button>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((o) => !o)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50 md:hidden"
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden border-t border-white/[0.06] md:hidden"
          >
            <nav className="bg-black px-4 py-3">
              <NavLink href="/" active={!isSettle && !isHistory} mobile>
                Markets
              </NavLink>
              <NavLink href="/settle" active={!!isSettle} mobile>
                Settle
              </NavLink>
              <NavLink href="/history" active={!!isHistory} mobile>
                History
              </NavLink>
              <div className="mt-2 border-t border-white/[0.06] pt-3">
                {ready && authenticated && walletAddress && (
                  <p className="mb-2 truncate px-1 text-xs font-mono text-white/50">
                    {formatPubkey(walletAddress)}
                  </p>
                )}
                {ready && !authenticated && (
                  <button
                    onClick={() => { login(); setMobileMenuOpen(false); }}
                    className="block w-full rounded-lg border border-white px-4 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    Login
                  </button>
                )}
                {ready && authenticated && (
                  <button
                    onClick={() => { logout(); setMobileMenuOpen(false); }}
                    className="block w-full rounded-lg border border-white/40 px-4 py-3 text-left text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
                  >
                    Logout
                  </button>
                )}
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
