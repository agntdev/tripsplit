/**
 * Amount parsing and display utilities.
 * See docs/details.md §AMOUNT PARSER.
 */

export function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "");
  if (!trimmed || !/^-?\d+(\.\d+)?$/.test(trimmed)) return null;

  const negative = trimmed.startsWith("-");
  const normalized = negative ? trimmed.slice(1) : trimmed;

  let cents: number;
  if (normalized.includes(".")) {
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    cents = Math.round(value * 100);
  } else {
    const value = Number(normalized);
    if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
    cents = Math.abs(value) >= 100 ? value : value * 100;
  }

  return negative ? -cents : cents;
}

export function formatCents(cents: number): string {
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const body = `$${dollars}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}