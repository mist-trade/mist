const MARKET_CODES = ['SH', 'SZ', 'BJ'] as const;
const MARKET_PATTERN = MARKET_CODES.join('|');

export function normalizeSecurityCode(code: string): string {
  const normalized = code.trim().toUpperCase();

  const suffixed = normalized.match(
    new RegExp(`^(\\d{6})\\.(${MARKET_PATTERN})$`),
  );
  if (suffixed) {
    return suffixed[1];
  }

  const prefixed = normalized.match(
    new RegExp(`^(${MARKET_PATTERN})(\\d{6})$`),
  );
  if (prefixed) {
    return prefixed[2];
  }

  return normalized;
}
