/**
 * Amount parsing and formatting utilities.
 * All internal amounts are integer cents. See docs/details.md §AMOUNT PARSER.
 */

/**
 * Parse a user-supplied amount string into integer cents.
 *
 * Accepts dollar format ("12.50", "-5.00") or bare cents ("1250" => 1250).
 * Bare integers ≥ 100 are treated as cents; smaller integers as dollars.
 */
export function parseAmount(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, "");

  if (!/^-?\d+(\.\d*)?$/.test(trimmed)) return null;

  if (trimmed.includes(".")) {
    const num = parseFloat(trimmed);
    if (isNaN(num)) return null;
    return Math.round(num * 100);
  }

  const num = parseInt(trimmed, 10);
  if (isNaN(num)) return null;
  if (Math.abs(num) >= 100) return num;
  return num * 100;
}

/**
 * Format integer cents for display, e.g. 1250 → "$12.50".
 * Negative values receive a leading minus sign.
 */
export function formatCents(c: number): string {
  const sign = c < 0 ? "-" : "";
  const abs = Math.abs(c);
  const dollars = Math.floor(abs / 100);
  const cents = abs % 100;
  return `${sign}$${dollars}.${cents.toString().padStart(2, "0")}`;
}