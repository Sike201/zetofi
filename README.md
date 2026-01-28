# Zeto

Intent board and atomic settlement on Solana. Post intents, create escrow deals, settle on-chain.

Live: [zetofi.vercel.app](https://zetofi.vercel.app)

## Run locally

```bash
npm install
```

Create `.env.local` with:

- `NEXT_PUBLIC_PRIVY_APP_ID` — from [Privy](https://dashboard.privy.io)
- `NEXT_PUBLIC_ZETO_PROGRAM_ID` — deployed Anchor program ID (see `anchor/`)
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project
- Optional: `NEXT_PUBLIC_SOLANA_RPC_DEVNET` / `NEXT_PUBLIC_SOLANA_RPC_MAINNET` (defaults to public RPC)

Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Repo

- **`src/`** — Next.js app: intent board, settle UI, deal pages. Privy for wallets, Supabase for intents, Anchor for escrow.
- **`anchor/`** — Solana escrow program (create, settle, cancel, expiry). Fee: 0.2% buyer-only on settlement.
- **`scripts/`** — Token helpers for testing.

Deployment (env, Anchor deploy, Vercel): see `DEPLOYMENT.md`.

## License

Private — all rights reserved.
