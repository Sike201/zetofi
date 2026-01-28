# Zeto - Intent Board & Atomic Settlement MVP

Production-ready MVP for **app.zeto.fi** using Next.js (App Router) + JavaScript + Tailwind CSS + Privy + Solana.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Privy

1. Create an account at [privy.io](https://privy.io)
2. Create a new app and get your App ID
3. Create a `.env.local` file in the root directory:

```bash
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
src/
├── app/
│   ├── layout.js          # Root layout with PrivyProvider
│   ├── page.js            # Home dashboard "/"
│   ├── board/
│   │   └── page.js        # Intent Board "/board"
│   ├── settle/
│   │   └── page.js        # Settlement Tool "/settle"
│   └── deal/
│       └── [id]/
│           └── page.js     # Deal Details "/deal/[id]"
├── components/
│   ├── Header.js          # Navigation + Auth
│   ├── Card.js            # Reusable card
│   ├── Input.js           # Text input wrapper
│   ├── Select.js          # Dropdown wrapper
│   └── DisclaimerBanner.js # Safety disclaimers
└── lib/
    ├── solana.js          # Network config & validation
    ├── storage.js         # localStorage helpers
    └── format.js          # Formatting utilities
```

## ⚙️ Configuration

### Network Settings

Edit `src/lib/solana.js`:

- **Default Network**: Change `DEFAULT_NETWORK` from `'devnet'` to `'mainnet'` (UI-only toggle)
- **Default Quote Mint**: Update `DEFAULT_QUOTE_MINT` to your preferred USDC mint:
  - Devnet: `'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'`
  - Mainnet: `'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'`

### Privy Configuration

The Privy provider is configured in `src/app/layout.js`. You can customize:
- Login methods
- Appearance theme
- Embedded wallet settings

## 🎯 Features

### Intent Board (`/board`)
- Create intent posts (token symbol, mint, side, size bucket, contact)
- Filter by token symbol, mint, or side
- No prices allowed
- All data stored in browser localStorage

### Settlement Tool (`/settle`)
- Choose role: Seller or Buyer
- Create atomic settlement deals with:
  - Base token (being sold)
  - Quote token (payment)
  - Counterparty address
  - Expiry time
- Fee preview (0.20% buy side, success-only)
- Test message signing functionality
- Generates shareable deal links

### Deal Details (`/deal/[id]`)
- View all deal terms
- Copy deal link
- Mark as settled (participants only)
- Cancel deal (participants only)
- Fee breakdown display

## 🔒 Safety & Disclaimers

All relevant pages include prominent disclaimers:
- Zeto does not broker trades, provide pricing, or facilitate negotiation
- Users are responsible for counterparty risk
- Settlement execution is not live yet (preview UX)
- Non-custodial on-chain escrow integration coming next

## 📝 Notes

- **No Backend Required**: All data is stored in browser localStorage
- **No On-Chain Execution**: This is a preview UX. On-chain escrow integration is planned for the next version
- **Privy Signing**: The test signing feature uses Privy's `signMessage` API. If you encounter issues, check Privy's Solana documentation for the latest API

## 🛠️ Development

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Lint
npm run lint
```

## 📦 Dependencies

- `next`: Next.js framework
- `@privy-io/react-auth`: Privy wallet authentication
- `@solana/web3.js`: Solana web3 utilities
- `tailwindcss`: Styling

## 🚧 Limitations (MVP Scope)

- No messaging/DMs/chat
- No price feeds
- No charts
- No order books
- No matching engines
- No on-chain program deployment
- Data stored in localStorage only (not persistent across devices)

## 📄 License

Private project - All rights reserved
