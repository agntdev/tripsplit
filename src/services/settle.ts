import { SETTLEMENT_EXPIRY_DAYS } from "../config";
import type { Repository } from "../storage/repository";
import type { Settlement } from "../types";
import { getPairBalance } from "./ledger";

export interface StartSettlementInput {
  tripId: number;
  payerUserId: number;
  payeeUserId: number;
  amountCents: number;
}

export type StartSettlementResult =
  | { ok: true; settlement: Settlement }
  | { ok: false; error: string };

function expiryIso(): string {
  const ms = SETTLEMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + ms).toISOString();
}

export function startSettlement(
  repo: Repository,
  input: StartSettlementInput,
): StartSettlementResult {
  const { tripId, payerUserId, payeeUserId, amountCents } = input;

  if (payerUserId === payeeUserId) {
    return { ok: false, error: "You can't settle with yourself." };
  }
  if (amountCents <= 0) {
    return { ok: false, error: "Amount must be greater than zero." };
  }

  const payee = repo.getParticipant(tripId, payeeUserId);
  if (!payee?.active) {
    return { ok: false, error: "Payee is not an active participant." };
  }

  const maxOwed = getPairBalance(tripId, payerUserId, payeeUserId, repo);
  if (amountCents > maxOwed) {
    return {
      ok: false,
      error:
        "That amount exceeds the suggested/ledger balance. Check 📊 Balances.",
    };
  }

  const settlement = repo.createSettlement({
    tripId,
    payerUserId,
    payeeUserId,
    amountCents,
    expiresAt: expiryIso(),
  });

  return { ok: true, settlement };
}

export function confirmPayer(
  repo: Repository,
  settlementId: number,
  actorUserId: number,
): Settlement | "not_found" | "forbidden" | "not_pending" {
  const settlement = repo.getSettlement(settlementId);
  if (!settlement) return "not_found";
  if (settlement.payerUserId !== actorUserId) return "forbidden";
  if (settlement.status !== "pending") return "not_pending";

  return (
    repo.updateSettlement(settlementId, {
      payerConfirmedAt: new Date().toISOString(),
    }) ?? "not_found"
  );
}

export function confirmPayee(
  repo: Repository,
  settlementId: number,
  actorUserId: number,
): Settlement | "not_found" | "forbidden" | "not_pending" | "payer_unconfirmed" {
  const settlement = repo.getSettlement(settlementId);
  if (!settlement) return "not_found";
  if (settlement.payeeUserId !== actorUserId) return "forbidden";
  if (settlement.status !== "pending") return "not_pending";
  if (!settlement.payerConfirmedAt) return "payer_unconfirmed";

  const now = new Date().toISOString();
  const updated = repo.updateSettlement(settlementId, {
    payeeConfirmedAt: now,
    status: "cleared",
  });
  if (!updated) return "not_found";

  repo.appendAuditLog(settlement.tripId, actorUserId, "settlement_cleared", {
    settlementId,
    payerUserId: settlement.payerUserId,
    payeeUserId: settlement.payeeUserId,
    amountCents: settlement.amountCents,
  });

  return updated;
}

export function cancelSettlement(
  repo: Repository,
  settlementId: number,
  actorUserId: number,
): Settlement | "not_found" | "forbidden" | "not_pending" {
  const settlement = repo.getSettlement(settlementId);
  if (!settlement) return "not_found";
  if (settlement.payerUserId !== actorUserId) return "forbidden";
  if (settlement.status !== "pending") return "not_pending";

  return (
    repo.updateSettlement(settlementId, { status: "expired" }) ?? "not_found"
  );
}