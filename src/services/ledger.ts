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

export function formatBalanceLine(displayName: string, cents: number): string {
  const sign = cents >= 0 ? "+" : "−";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${displayName}   ${sign}$${dollars}.${String(rem).padStart(2, "0")}`;
}