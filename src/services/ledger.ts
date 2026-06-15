import type { Repository } from "../storage/repository";

export type BalanceMap = Map<number, number>;

export function computeBalances(tripId: number, repo: Repository): BalanceMap {
  const balances = new Map<number, number>();

  const add = (userId: number, delta: number) => {
    balances.set(userId, (balances.get(userId) ?? 0) + delta);
  };

  for (const expense of repo.listExpenses(tripId)) {
    add(expense.payerUserId, expense.amountCents);
    for (const share of repo.listSharesForExpense(expense.id)) {
      add(share.participantUserId, -share.shareCents);
    }
  }

  for (const settlement of repo.listSettlements(tripId)) {
    if (settlement.status !== "cleared") continue;
    add(settlement.payerUserId, -settlement.amountCents);
    add(settlement.payeeUserId, settlement.amountCents);
  }

  return balances;
}

/** Net amount payer owes payee (USD cents), floored at zero. */
export function getPairBalance(
  tripId: number,
  payerUserId: number,
  payeeUserId: number,
  repo: Repository,
): number {
  let net = 0;

  for (const expense of repo.listExpenses(tripId)) {
    const expenseShares = repo.listSharesForExpense(expense.id);
    if (expense.payerUserId === payeeUserId) {
      for (const share of expenseShares) {
        if (share.participantUserId === payerUserId) {
          net += share.shareCents;
        }
      }
    } else if (expense.payerUserId === payerUserId) {
      for (const share of expenseShares) {
        if (share.participantUserId === payeeUserId) {
          net -= share.shareCents;
        }
      }
    }
  }

  for (const settlement of repo.listSettlements(tripId)) {
    if (settlement.status !== "cleared") continue;
    if (
      settlement.payerUserId === payerUserId &&
      settlement.payeeUserId === payeeUserId
    ) {
      net -= settlement.amountCents;
    } else if (
      settlement.payerUserId === payeeUserId &&
      settlement.payeeUserId === payerUserId
    ) {
      net += settlement.amountCents;
    }
  }

  return Math.max(0, net);
}

export function formatBalanceLine(displayName: string, cents: number): string {
  const sign = cents >= 0 ? "+" : "−";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${displayName}   ${sign}$${dollars}.${String(rem).padStart(2, "0")}`;
}