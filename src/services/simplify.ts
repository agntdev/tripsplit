import type { BalanceMap } from "./ledger";

export interface SuggestedPayment {
  payerUserId: number;
  payeeUserId: number;
  amountCents: number;
}

interface Bucket {
  userId: number;
  cents: number;
}

/** Greedy debt simplification per docs/design.md §1.7. */
export function greedyPairing(balances: BalanceMap): SuggestedPayment[] {
  const creditors: Bucket[] = [];
  const debtors: Bucket[] = [];

  for (const [userId, cents] of balances) {
    if (cents > 0) creditors.push({ userId, cents });
    else if (cents < 0) debtors.push({ userId, cents: -cents });
  }

  creditors.sort((a, b) => b.cents - a.cents);
  debtors.sort((a, b) => b.cents - a.cents);

  const out: SuggestedPayment[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci];
    const d = debtors[di];
    const amount = Math.min(c.cents, d.cents);
    if (amount > 0) {
      out.push({
        payerUserId: d.userId,
        payeeUserId: c.userId,
        amountCents: amount,
      });
    }
    c.cents -= amount;
    d.cents -= amount;
    if (c.cents === 0) ci += 1;
    if (d.cents === 0) di += 1;
  }

  return out;
}