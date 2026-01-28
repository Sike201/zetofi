'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';

const solanaConnectors = toSolanaWalletConnectors({
  shouldAutoConnect: true,
});

export default function Providers({ children }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!appId) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-5 px-6 text-white">
        <h1 className="text-xl font-semibold">Setup required</h1>
        <p className="text-white/60 text-sm text-center max-w-md">
          Add <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono text-xs">NEXT_PUBLIC_PRIVY_APP_ID</code> to your Vercel project Environment Variables, then redeploy.
        </p>
        <p className="text-white/40 text-xs">Get your Privy App ID from <a href="https://dashboard.privy.io" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60">dashboard.privy.io</a></p>
      </div>
    );
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#2563eb',
          walletList: ['phantom', 'solflare', 'backpack', 'jupiter'],
        },
        externalWallets: {
          solana: {
            connectors: solanaConnectors,
          },
          ethereum: {
            connectors: [],
          },
        },
        embeddedWallets: {
          createOnLogin: 'off', // Disable embedded wallets, only use external
        },
        solanaClusters: [
          { name: 'devnet', rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_DEVNET || 'https://api.devnet.solana.com' },
          { name: 'mainnet-beta', rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET || 'https://api.mainnet-beta.solana.com' },
        ],
      }}
    >
      {children}
    </PrivyProvider>
  );
}
