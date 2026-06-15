export interface ShareLine {
  userId: number;
  shareCents: number;
}

export function splitEven(
  amountCents: number,
  participantIds: number[],
  payerUserId: number,
): ShareLine[] {
  const n = participantIds.length;
  if (n === 0) return [];
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;
  return participantIds.map((userId) => ({
    userId,
    shareCents: userId === payerUserId ? base + remainder : base,
  }));
}

export function finalizeCustomCents(
  amountCents: number,
  partial: ShareLine[],
  payerUserId: number,
  participantIds: number[],
): { ok: true; shares: ShareLine[] } | { ok: false; gapCents: number } {
  const byUser = new Map<number, number>();
  for (const id of participantIds) byUser.set(id, 0);
  for (const line of partial) {
    byUser.set(line.userId, (byUser.get(line.userId) ?? 0) + line.shareCents);
  }
  const total = [...byUser.values()].reduce((s, v) => s + v, 0);
  if (total > amountCents) {
    return { ok: false, gapCents: total - amountCents };
  }
  const remainder = amountCents - total;
  byUser.set(payerUserId, (byUser.get(payerUserId) ?? 0) + remainder);
  return {
    ok: true,
    shares: participantIds.map((userId) => ({
      userId,
      shareCents: byUser.get(userId) ?? 0,
    })),
  };
}

export function splitCustomPercent(
  amountCents: number,
  percents: Array<{ userId: number; percent: number }>,
  payerUserId: number,
  participantIds: number[],
): ShareLine[] {
  const byUser = new Map<number, number>();
  for (const id of participantIds) byUser.set(id, 0);
  for (const { userId, percent } of percents) {
    byUser.set(userId, Math.floor((amountCents * percent) / 100));
  }
  const total = [...byUser.values()].reduce((s, v) => s + v, 0);
  const remainder = amountCents - total;
  byUser.set(payerUserId, (byUser.get(payerUserId) ?? 0) + remainder);
  return participantIds.map((userId) => ({
    userId,
    shareCents: byUser.get(userId) ?? 0,
  }));
}

export function roundingNote(
  amountCents: number,
  shares: ShareLine[],
  payerUserId: number,
): string | null {
  const n = shares.length;
  if (n === 0) return null;
  const base = Math.floor(amountCents / n);
  const remainder = amountCents - base * n;
  if (remainder <= 0) return null;
  const payerShare = shares.find((s) => s.userId === payerUserId)?.shareCents ?? 0;
  if (payerShare === base + remainder) {
    return `(payer absorbs +${formatCentsInternal(remainder)} rounding)`;
  }
  return null;
}

function formatCentsInternal(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}