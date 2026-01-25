# Zeto Escrow - Deployment Guide

## Prerequisites

1. **Rust & Cargo** - Install from https://rustup.rs
2. **Solana CLI** - Install from https://docs.solana.com/cli/install-solana-cli-tools
3. **Anchor CLI** - Install with `cargo install --git https://github.com/coral-xyz/anchor avm --locked --force`
4. **Node.js 18+** - Install from https://nodejs.org

## Step 1: Set Up Solana CLI

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

## Step 2: Build the Anchor Program

```bash
cd anchor

# Install Anchor dependencies
anchor build

# Get the program ID from the build
solana address -k target/deploy/zeto_escrow-keypair.json
```

## Step 3: Update Program ID

After building, you'll get a program ID. Update it in:

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

## Step 4: Deploy to Devnet

```bash
cd anchor
anchor deploy --provider.cluster devnet
```

If you get "insufficient funds", airdrop more SOL:
```bash
solana airdrop 2
```

### Upgrading the program (e.g. 0.2% buyer-only fees)

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

## Step 5: Set Up Frontend

```bash
# Back to project root
cd ..

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push database schema
npx prisma db push
```

Create `.env.local` in the project root and add:
- `NEXT_PUBLIC_PRIVY_APP_ID` - Your Privy app ID
- `NEXT_PUBLIC_ZETO_PROGRAM_ID` - The deployed program ID

Fees are always sent to `8zatMKSZT1xm7p2h7671pUmZQCv6seCd82tU1QmWmxeC` (hardcoded).

## Step 6: Run the App

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

### Devnet USDC

The default quote mint is devnet USDC: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

To get devnet USDC, use a faucet or create your own test token.

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

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy application ID | Yes |
| `NEXT_PUBLIC_ZETO_PROGRAM_ID` | Deployed program ID | Yes |
| `DATABASE_URL` | SQLite database path | Yes |
| `NEXT_PUBLIC_SOLANA_RPC_DEVNET` | Custom devnet RPC | No |
| `NEXT_PUBLIC_SOLANA_RPC_MAINNET` | Custom mainnet RPC | No |

Fee recipient is fixed to `8zatMKSZT1xm7p2h7671pUmZQCv6seCd82tU1QmWmxeC` in code.

## Mainnet Deployment

1. Switch Solana CLI to mainnet:
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

## Security Considerations

- The program is non-custodial - only participants can move funds
- Fees are only taken on successful settlement
- Seller can cancel anytime before buyer accepts
- Expired deals can be reclaimed by anyone (funds go to seller)
- Always verify mint addresses before creating deals
