/**
 * Format a number with commas and optional decimals
 * @param {string|number} value - The number to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} - Formatted number string
 */
export function formatNumber(value, decimals = 2) {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a timestamp to a readable date string
 * Handles both Unix seconds and milliseconds
 * @param {number|string} timestamp - Unix timestamp
 * @returns {string} - Formatted date string
 */
export function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  // Convert to number if string
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  
  if (isNaN(ts) || ts <= 0) return 'Invalid date';
  
  // Determine if timestamp is in seconds or milliseconds
  // If less than 10 billion, it's likely seconds (dates before 2286)
  // If greater, it's likely milliseconds
  const isSeconds = ts < 10000000000;
  const date = new Date(isSeconds ? ts * 1000 : ts);
  
  // Validate the date
  if (isNaN(date.getTime())) return 'Invalid date';
  
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

/**
 * Format a relative time (e.g., "2 hours ago" or "in 2 hours")
 * @param {number|string} timestamp - Unix timestamp
 * @returns {string} - Relative time string
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'N/A';
  
  const ts = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(ts) || ts <= 0) return 'Invalid date';
  
  const isSeconds = ts < 10000000000;
  const date = new Date(isSeconds ? ts * 1000 : ts);
  
  if (isNaN(date.getTime())) return 'Invalid date';
  
  const now = new Date();
  const diffMs = date - now; // Positive = future, Negative = past
  const absDiffMs = Math.abs(diffMs);
  const isPast = diffMs < 0;
  
  const diffSecs = Math.floor(absDiffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeStr;
  if (diffSecs < 60) {
    timeStr = 'less than a minute';
  } else if (diffMins < 60) {
    timeStr = `${diffMins} minute${diffMins > 1 ? 's' : ''}`;
  } else if (diffHours < 24) {
    timeStr = `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  } else if (diffDays < 7) {
    timeStr = `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  } else {
    return formatDate(timestamp);
  }

  return isPast ? `${timeStr} ago` : `in ${timeStr}`;
}

/**
 * Format token amount with decimals
 * @param {string|number} amount - Raw token amount
 * @param {number} decimals - Token decimals (default 6 for USDC)
 * @param {number} displayDecimals - Decimals to display
 * @returns {string} - Formatted amount
 */
export function formatTokenAmount(amount, decimals = 6, displayDecimals = 2) {
  const raw = typeof amount === 'string' ? BigInt(amount) : BigInt(Math.floor(amount));
  const divisor = BigInt(10 ** decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, displayDecimals);
  
  return `${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Calculate fee amounts
 * @param {string|number} amount - Amount
 * @param {number} feeBps - Fee in basis points
 * @returns {Object} - { fee, net }
 */
export function calculateFee(amount, feeBps = 10) {
  const amountNum = typeof amount === 'string' ? parseFloat(amount) : amount;
  const fee = amountNum * (feeBps / 10000);
  const net = amountNum - fee;
  return { fee, net };
}
