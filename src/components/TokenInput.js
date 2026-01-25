'use client';

import { useState, useEffect, useCallback } from 'react';
import { isValidPubkey, formatPubkey } from '@/lib/solana';

export default function TokenInput({
  label,
  value,
  onChange,
  onTokenInfo,
  placeholder = 'Token mint address',
  error,
  required = false,
  disabled = false,
  className = '',
}) {
  const [tokenInfo, setTokenInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(true);

  const lookupToken = useCallback(async (mint) => {
    if (!mint || !isValidPubkey(mint)) {
      setTokenInfo(null);
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`/api/token/${mint}`);
      if (response.ok) {
        const { token } = await response.json();
        setTokenInfo(token);
      } else {
        setTokenInfo(null);
      }
    } catch (err) {
      console.error('Token lookup error:', err);
      setTokenInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (value && value.length >= 32) {
        lookupToken(value);
      } else {
        setTokenInfo(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [value, lookupToken]);

  useEffect(() => {
    if (onTokenInfo) onTokenInfo(tokenInfo);
  }, [tokenInfo, onTokenInfo]);

  const handleChange = (e) => {
    onChange(e);
    setShowDropdown(true);
  };

  const handleDropdownClick = () => {
    setShowDropdown(false);
  };

  const isValid = value && isValidPubkey(value);
  const shouldShowDropdown = showDropdown && isValid && tokenInfo;

  return (
    <div className={`relative ${className}`}>
      <label className="mb-1 block text-sm font-medium text-white/70">
        {label}
        {required && <span className="ml-1 text-white/50">*</span>}
      </label>
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-50 ${tokenInfo ? 'pr-10' : ''}`}
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-white/40" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        )}
        {!isLoading && isValid && tokenInfo && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
      {shouldShowDropdown && (
        <div
          className="absolute z-10 mt-1 w-full cursor-pointer rounded-lg bg-[#1a1a1a] p-3 transition-colors hover:bg-[#222]"
          onClick={handleDropdownClick}
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] text-sm font-medium text-white">
              {tokenInfo.symbol?.slice(0, 2) || '??'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-white">{tokenInfo.name}</span>
                <span className="rounded bg-[#2a2a2a] px-2 py-0.5 text-xs font-medium text-white/60">
                  {tokenInfo.symbol}
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-xs text-white/50">
                {formatPubkey(tokenInfo.mint, 8)}
              </p>
            </div>
            <div className="shrink-0 text-white/40">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-sm text-white/60">{error}</p>}
    </div>
  );
}
