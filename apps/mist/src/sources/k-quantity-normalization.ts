import { HttpException, HttpStatus } from '@nestjs/common';
import { Decimal8, normalizeExternalDecimalText } from '@app/decimal';
import { DataSource } from '@app/shared-data';

const MAX_DECIMAL8_FRACTION_DIGITS = 8;

/**
 * QMT historical/reconciliation volume write-layer conversion:
 * provider-native lots → canonical shares (exact fixed-point ×100).
 * A non-integral lot count violates provider contract and fails closed.
 */
export function normalizeQmtVolume(value: string | null): string | null {
  if (value === null) return null;
  if (value.includes('.')) {
    throw new HttpException(
      'QMT_INVALID_FRACTIONAL_VOLUME: provider volume must be an integral lot count',
      HttpStatus.BAD_GATEWAY,
    );
  }
  return Decimal8.parseCanonical(value).scaleByUnit(100).formatCanonical();
}

/**
 * TDX historical/reconciliation quantity write-layer conversion:
 * provider-native 万元 → canonical yuan (exact fixed-point ×10000) for amount;
 * volume stays canonical share value.
 */
export function normalizeTdxBarQuantity(
  value: string | null,
  fieldName: 'volume' | 'amount',
): string | null {
  if (value === null) return null;
  const normalized = normalizeExternalDecimalText(value);
  if (fieldName === 'amount') {
    return Decimal8.parseCanonical(normalized)
      .scaleByUnit(10_000)
      .formatCanonical();
  }
  return normalized;
}

/**
 * Expand a non-negative finite JS number into plain unsigned decimal text
 * suitable for {@link normalizeExternalDecimalText} (no scientific notation).
 */
export function expandFiniteQuantityText(
  value: number,
  fieldName: 'volume' | 'amount',
): string {
  if (!Number.isFinite(value) || value < 0 || Object.is(value, -0)) {
    throw new TypeError(`Invalid non-negative ${fieldName}: ${String(value)}`);
  }
  const raw = value.toString();
  if (!/[eE]/.test(raw)) {
    return normalizeExternalDecimalText(raw);
  }

  const match = /^([0-9]+)(?:\.([0-9]+))?[eE]([+-]?[0-9]+)$/.exec(raw);
  if (!match) {
    throw new TypeError(`Unsupported numeric literal for ${fieldName}: ${raw}`);
  }
  const [, intPart, fracPart = '', expRaw] = match;
  const exponent = Number(expRaw);
  const digits = `${intPart}${fracPart}`;
  const decimalPos = intPart.length + exponent;

  let expanded: string;
  if (decimalPos <= 0) {
    expanded = `0.${'0'.repeat(-decimalPos)}${digits}`;
  } else if (decimalPos >= digits.length) {
    expanded = `${digits}${'0'.repeat(decimalPos - digits.length)}`;
  } else {
    expanded = `${digits.slice(0, decimalPos)}.${digits.slice(decimalPos)}`;
  }

  // Edge JSON payloads may introduce benign float representation tails beyond scale 8
  const dotIdx = expanded.indexOf('.');
  if (
    dotIdx !== -1 &&
    expanded.length - dotIdx - 1 > MAX_DECIMAL8_FRACTION_DIGITS
  ) {
    expanded = Number(expanded).toFixed(MAX_DECIMAL8_FRACTION_DIGITS);
  }
  return normalizeExternalDecimalText(expanded);
}

/**
 * Canonicalize raw push-bars numeric quantities (`volume`, optional `amount`)
 * according to source semantics so edge reconciliation shares the exact write-layer
 * unit contract as QmtSource and TdxSource (shares / yuan).
 */
export function normalizePushBarQuantities(
  source: DataSource,
  volume: number,
  amount?: number,
): { readonly volume: string; readonly amount: string | null } {
  const volumeText = expandFiniteQuantityText(volume, 'volume');
  const amountText =
    amount != null ? expandFiniteQuantityText(amount, 'amount') : null;

  if (source === DataSource.QMT) {
    const canonicalVol = normalizeQmtVolume(volumeText);
    if (canonicalVol === null) {
      throw new TypeError('QMT push bar volume cannot be null');
    }
    return {
      volume: canonicalVol,
      amount: amountText,
    };
  }

  if (source === DataSource.TDX) {
    const canonicalVol = normalizeTdxBarQuantity(volumeText, 'volume');
    if (canonicalVol === null) {
      throw new TypeError('TDX push bar volume cannot be null');
    }
    return {
      volume: canonicalVol,
      amount: normalizeTdxBarQuantity(amountText, 'amount'),
    };
  }

  return {
    volume: volumeText,
    amount: amountText,
  };
}
