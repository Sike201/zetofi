# Zeto – Deployment

You need Rust, Solana CLI, Anchor, and Node 18+ (see [rustup](https://rustup.rs), [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools), [Anchor](https://www.anchor-lang.com/), [Node](https://nodejs.org)).

## Solana CLI

```bash
# Configure for devnet
solana config set --url devnet

# Generate a new keypair (or use existing)
solana-keygen new -o ~/.config/solana/id.json

# Check your address
solana address

# Airdrop SOL for deployment (devnet only)
solana airdrop 2
solana airdrop 2  # Run multiple times if needed
```

## Build Anchor

```bash
cd anchor

# Install Anchor dependencies
anchor build

# Get the program ID from the build
solana address -k target/deploy/zeto_escrow-keypair.json
```

## Set program ID

After build, get the program ID and set it in:

1. `anchor/programs/zeto_escrow/src/lib.rs`:
   ```rust
   declare_id!("YOUR_PROGRAM_ID_HERE");
   ```

2. `anchor/Anchor.toml`:
   ```toml
   [programs.devnet]
   zeto_escrow = "YOUR_PROGRAM_ID_HERE"
   ```

3. `.env.local`:
   ```
   NEXT_PUBLIC_ZETO_PROGRAM_ID=YOUR_PROGRAM_ID_HERE
   ```

Then rebuild:
```bash
anchor build
```

## Deploy to devnet

```bash
cd anchor
anchor deploy --provider.cluster devnet
```

If you get "insufficient funds", airdrop more SOL:
```bash
solana airdrop 2
```

### Upgrading (e.g. 0.2% buyer-only fee)

If you **already have** the program deployed at `BY1HuoCGtM71JTNhpwP7vSfRoiZPfcosgMsaDbFRqJTo` and only changed code (e.g. fee logic):

1. **Build** the updated program:
   ```bash
   cd anchor
   anchor build
   ```

2. **Upgrade** (don’t deploy) so the same program ID gets the new logic:
   ```bash
   anchor upgrade target/deploy/zeto_escrow.so --program-id BY1HuoCGtM71JTNhpwP7vSfRoiZPfcosgMsaDbFRqJTo --provider.cluster devnet
   ```
   Your deployer wallet (`~/.config/solana/id.json` or `Anchor.toml` provider) must be the **upgrade authority** for that program.

3. **Frontend**: The app already uses 0.2% in UI and client logic. Ensure `NEXT_PUBLIC_ZETO_PROGRAM_ID` matches the program ID above. Restart `npm run dev` if it’s running.

4. **New deals only**: Existing deals use the program that was live when they were created. Only **new** deals created after the upgrade use the 0.2% buyer-only fees.

If upgrade fails (e.g. wrong upgrade authority), you’d need to deploy a **new** program (new keypair), update the program ID in `lib.rs`, `Anchor.toml`, and `.env.local`, then redeploy.

## Frontend

From project root:

```bash
cd ..
npm install
```

Create `.env.local` with at least `NEXT_PUBLIC_PRIVY_APP_ID` and `NEXT_PUBLIC_ZETO_PROGRAM_ID`. Fee recipient is fixed in code: `8zatMKSZT1xm7p2h7671pUmZQCv6seCd82tU1QmWmxeC`.

## Run

```bash
npm run dev
```

Visit http://localhost:3000

## Testing the Escrow

### Create Test Tokens (Devnet)

```bash
# Create a test token
spl-token create-token

# Note the token address, then create an account
spl-token create-account <TOKEN_ADDRESS>

# Mint some tokens to your account
spl-token mint <TOKEN_ADDRESS> 1000
```

### Test Flow

1. **As Seller:**
   - Connect wallet on /settle
   - Select "Seller" role
   - Enter base token mint (your test token)
   - Enter amount, quote mint (USDC devnet), quote amount
   - Enter buyer's wallet address
   - Click "Create & Deposit Escrow"

2. **As Buyer:**
   - Open the deal link
   - Connect wallet
   - Ensure you have quote tokens (USDC devnet)
   - Click "Accept & Settle"

### Devnet Quote Token

The default quote mint on devnet is: `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`

To get devnet tokens, use a faucet or create your own test token.

## Common Issues

### "Program not found"
- Ensure the program is deployed: `solana program show <PROGRAM_ID>`
- Check you're on the right network: `solana config get`

### "Insufficient funds"
- Airdrop more SOL: `solana airdrop 2`
- Check balance: `solana balance`

### "Token account not found"
- Create ATA: `spl-token create-account <MINT>`

### Transaction simulation failed
- Check you have enough tokens
- Verify mint addresses are correct
- Ensure expiry is in the future

## Env vars

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Yes |
| `NEXT_PUBLIC_ZETO_PROGRAM_ID` | Yes |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes (for intents/deals) |
| `NEXT_PUBLIC_SOLANA_RPC_DEVNET` / `_MAINNET` | No (defaults to public RPC) |

## Mainnet

1. Solana CLI to mainnet:
   ```bash
   solana config set --url mainnet-beta
   ```

2. Ensure you have SOL for deployment (~3 SOL)

3. Deploy:
   ```bash
   anchor deploy --provider.cluster mainnet
   ```

4. Update `.env.local` with mainnet program ID

5. Update `NEXT_PUBLIC_DEFAULT_QUOTE_MINT` to mainnet USDC:
   ```
   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```

## Security

Non-custodial: only seller/buyer move funds. Fees only on settlement. Seller can cancel before accept. Expired deals revert to seller. Verify mints before creating deals.
