import { computeBalances } from "./ledger";
import type { Repository } from "../storage/repository";

const CSV_HEADER =
  "expense_id,timestamp,payer,description,amount_cents,participant,share_cents,settlement_id,settlement_status,net_balance";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function memberName(
  repo: Repository,
  tripId: number,
  userId: number,
): string {
  return repo.getParticipant(tripId, userId)?.displayName ?? `user${userId}`;
}

export function buildAuditCsv(tripId: number, repo: Repository): string {
  const rows: string[] = [CSV_HEADER];

  for (const expense of repo.listExpenses(tripId)) {
    const payer = memberName(repo, tripId, expense.payerUserId);
    const shares = repo.listSharesForExpense(expense.id);
    for (const share of shares) {
      const participant = memberName(repo, tripId, share.participantUserId);
      rows.push(
        [
          expense.id,
          expense.createdAt,
          csvEscape(payer),
          csvEscape(expense.description),
          expense.amountCents,
          csvEscape(participant),
          share.shareCents,
          "",
          "",
          "",
        ].join(","),
      );
    }
  }

  for (const settlement of repo.listSettlements(tripId)) {
    const payer = memberName(repo, tripId, settlement.payerUserId);
    const payee = memberName(repo, tripId, settlement.payeeUserId);
    rows.push(
      [
        "",
        settlement.createdAt,
        csvEscape(payer),
        "settlement",
        settlement.amountCents,
        csvEscape(payee),
        settlement.amountCents,
        settlement.id,
        settlement.status,
        "",
      ].join(","),
    );
  }

  const balances = computeBalances(tripId, repo);
  for (const [userId, cents] of balances) {
    const name = memberName(repo, tripId, userId);
    rows.push(
      [
        "",
        "",
        "",
        "NET BALANCE",
        "",
        csvEscape(name),
        "",
        "",
        "",
        cents,
      ].join(","),
    );
  }

  return rows.join("\n");
}