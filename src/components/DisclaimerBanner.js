export default function DisclaimerBanner({ variant = 'default' }) {
  const disclaimers = {
    default: [
      'Zeto does not broker trades, provide pricing, or facilitate negotiation.',
      'You are responsible for counterparty risk. Negotiate privately off-platform.',
      'Settlement will be non-custodial and on-chain when live.',
    ],
    settlement: [
      'Settlement execution is not live yet. This is a preview UX.',
      'Non-custodial on-chain escrow integration coming next.',
    ],
  };

  const messages = disclaimers[variant] || disclaimers.default;

  return (
    <div className="rounded-xl border border-white/20 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 text-white/40">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-white/80">Disclaimer</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-white/60">
            {messages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
