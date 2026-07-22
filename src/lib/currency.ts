/**
 * Centralised GBP currency formatting.
 *
 * All billing-related UI (summaries, edit forms, invoices, proposals)
 * MUST use these helpers so amounts render consistently as `£1,234.00`
 * with thousands separators, two decimal places, and the en-GB locale.
 *
 * Do not introduce ad-hoc patterns like `£${n.toFixed(2)}` or
 * `£${n.toLocaleString()}` in new code — they drift in formatting.
 */

const gbpFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const gbpFormatterNoDecimals = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("en-GB", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a value as GBP with two decimals, e.g. `£99.00`, `£1,234.50`. */
export function formatGBP(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return gbpFormatter.format(Number.isFinite(n as number) ? (n as number) : 0);
}

/** Format a value as GBP without decimals, e.g. `£1,234`. Use only for whole-pound totals. */
export function formatGBPWhole(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return gbpFormatterNoDecimals.format(Number.isFinite(n as number) ? (n as number) : 0);
}

/** Format a plain number with two decimals and thousands separators (no currency symbol). */
export function formatNumber2dp(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return numberFormatter.format(Number.isFinite(n as number) ? (n as number) : 0);
}
