import { MAX_DESCRIPTION_LENGTH } from "../config";
import { parseAmount } from "./amount";

export function parseExpenseInput(
  text: string,
): { amountCents: number; description: string } | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  const amountCents = parseAmount(parts[0]);
  if (amountCents === null) return null;
  const description = parts.slice(1).join(" ").trim().slice(0, MAX_DESCRIPTION_LENGTH);
  return { amountCents, description };
}