/**
 * Persistence layer for TripSplit.
 *
 * `createRepository()` returns a fresh in-memory store — the harness default.
 * `makeBot()` creates one repository per call so the test harness gets isolated
 * state per spec. A PostgreSQL-backed implementation of the same `Repository`
 * interface (matching storage/schema.sql) can be swapped in for production.
 */
import type {
  AuditAction,
  AuditLog,
  Expense,
  Participant,
  Settlement,
  SettlementStatus,
  Share,
  Trip,
} from "../types";

export interface CreateTripInput {
  telegramGroupId: number;
  organizerUserId: number;
  organizerDisplayName: string;
}

export interface CreateExpenseInput {
  tripId: number;
  payerUserId: number;
  amountCents: number;
  description: string;
  shares: Array<{ participantUserId: number; shareCents: number }>;
}

export interface CreateSettlementInput {
  tripId: number;
  payerUserId: number;
  payeeUserId: number;
  amountCents: number;
  expiresAt: string;
}

export interface Repository {
  getTripByGroupId(telegramGroupId: number): Trip | undefined;
  getTripById(tripId: number): Trip | undefined;
  createTrip(input: CreateTripInput): Trip;

  getParticipant(
    tripId: number,
    telegramUserId: number,
  ): Participant | undefined;
  listActiveParticipants(tripId: number): Participant[];
  upsertParticipant(
    tripId: number,
    telegramUserId: number,
    displayName: string,
  ): Participant;
  deactivateParticipant(
    tripId: number,
    telegramUserId: number,
  ): Participant | undefined;

  createExpense(input: CreateExpenseInput): { expense: Expense; shares: Share[] };
  listExpenses(tripId: number): Expense[];
  listSharesForExpense(expenseId: number): Share[];
  listSharesForTrip(tripId: number): Share[];

  createSettlement(input: CreateSettlementInput): Settlement;
  getSettlement(id: number): Settlement | undefined;
  listSettlements(tripId: number): Settlement[];
  updateSettlement(
    id: number,
    patch: Partial<
      Pick<
        Settlement,
        | "status"
        | "payerConfirmedAt"
        | "payeeConfirmedAt"
      >
    >,
  ): Settlement | undefined;
  listExpiredPendingSettlements(nowIso: string): Settlement[];

  appendAuditLog(
    tripId: number,
    actorUserId: number,
    action: AuditAction,
    payload?: Record<string, unknown>,
  ): AuditLog;
  listAuditLogs(tripId: number): AuditLog[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export function createRepository(): Repository {
  const trips = new Map<number, Trip>();
  const tripsByGroup = new Map<number, Trip>();
  const participants = new Map<number, Participant>();
  const expenses = new Map<number, Expense>();
  const shares = new Map<number, Share>();
  const settlements = new Map<number, Settlement>();
  const auditLogs = new Map<number, AuditLog>();

  let tripSeq = 0;
  let participantSeq = 0;
  let expenseSeq = 0;
  let shareSeq = 0;
  let settlementSeq = 0;
  let auditSeq = 0;

  function findParticipant(
    tripId: number,
    telegramUserId: number,
  ): Participant | undefined {
    for (const p of participants.values()) {
      if (p.tripId === tripId && p.telegramUserId === telegramUserId) {
        return p;
      }
    }
    return undefined;
  }

  return {
    getTripByGroupId(telegramGroupId) {
      return tripsByGroup.get(telegramGroupId);
    },

    getTripById(tripId) {
      return trips.get(tripId);
    },

    createTrip(input) {
      const existing = tripsByGroup.get(input.telegramGroupId);
      if (existing) return existing;

      const trip: Trip = {
        id: ++tripSeq,
        telegramGroupId: input.telegramGroupId,
        organizerUserId: input.organizerUserId,
        createdAt: nowIso(),
      };
      trips.set(trip.id, trip);
      tripsByGroup.set(trip.telegramGroupId, trip);

      const organizer: Participant = {
        id: ++participantSeq,
        tripId: trip.id,
        telegramUserId: input.organizerUserId,
        displayName: input.organizerDisplayName,
        active: true,
        joinedAt: nowIso(),
        removedAt: null,
      };
      participants.set(organizer.id, organizer);
      return trip;
    },

    getParticipant(tripId, telegramUserId) {
      return findParticipant(tripId, telegramUserId);
    },

    listActiveParticipants(tripId) {
      return [...participants.values()].filter(
        (p) => p.tripId === tripId && p.active,
      );
    },

    upsertParticipant(tripId, telegramUserId, displayName) {
      const existing = findParticipant(tripId, telegramUserId);
      if (existing) {
        existing.active = true;
        existing.displayName = displayName;
        existing.removedAt = null;
        return existing;
      }
      const row: Participant = {
        id: ++participantSeq,
        tripId,
        telegramUserId,
        displayName,
        active: true,
        joinedAt: nowIso(),
        removedAt: null,
      };
      participants.set(row.id, row);
      return row;
    },

    deactivateParticipant(tripId, telegramUserId) {
      const existing = findParticipant(tripId, telegramUserId);
      if (!existing || !existing.active) return undefined;
      existing.active = false;
      existing.removedAt = nowIso();
      return existing;
    },

    createExpense(input) {
      const expense: Expense = {
        id: ++expenseSeq,
        tripId: input.tripId,
        payerUserId: input.payerUserId,
        amountCents: input.amountCents,
        description: input.description,
        createdAt: nowIso(),
      };
      expenses.set(expense.id, expense);

      const createdShares: Share[] = input.shares.map((s) => {
        const row: Share = {
          id: ++shareSeq,
          expenseId: expense.id,
          participantUserId: s.participantUserId,
          shareCents: s.shareCents,
        };
        shares.set(row.id, row);
        return row;
      });

      return { expense, shares: createdShares };
    },

    listExpenses(tripId) {
      return [...expenses.values()].filter((e) => e.tripId === tripId);
    },

    listSharesForExpense(expenseId) {
      return [...shares.values()].filter((s) => s.expenseId === expenseId);
    },

    listSharesForTrip(tripId) {
      const expenseIds = new Set(
        [...expenses.values()]
          .filter((e) => e.tripId === tripId)
          .map((e) => e.id),
      );
      return [...shares.values()].filter((s) => expenseIds.has(s.expenseId));
    },

    createSettlement(input) {
      const row: Settlement = {
        id: ++settlementSeq,
        tripId: input.tripId,
        payerUserId: input.payerUserId,
        payeeUserId: input.payeeUserId,
        amountCents: input.amountCents,
        status: "pending",
        payerConfirmedAt: null,
        payeeConfirmedAt: null,
        expiresAt: input.expiresAt,
        createdAt: nowIso(),
      };
      settlements.set(row.id, row);
      return row;
    },

    getSettlement(id) {
      return settlements.get(id);
    },

    listSettlements(tripId) {
      return [...settlements.values()].filter((s) => s.tripId === tripId);
    },

    updateSettlement(id, patch) {
      const row = settlements.get(id);
      if (!row) return undefined;
      if (patch.status !== undefined) row.status = patch.status as SettlementStatus;
      if (patch.payerConfirmedAt !== undefined) {
        row.payerConfirmedAt = patch.payerConfirmedAt;
      }
      if (patch.payeeConfirmedAt !== undefined) {
        row.payeeConfirmedAt = patch.payeeConfirmedAt;
      }
      return row;
    },

    listExpiredPendingSettlements(nowIsoValue) {
      const now = Date.parse(nowIsoValue);
      return [...settlements.values()].filter(
        (s) =>
          s.status === "pending" && Date.parse(s.expiresAt) < now,
      );
    },

    appendAuditLog(tripId, actorUserId, action, payload = {}) {
      const row: AuditLog = {
        id: ++auditSeq,
        tripId,
        actorUserId,
        action,
        payloadJson: JSON.stringify(payload),
        createdAt: nowIso(),
      };
      auditLogs.set(row.id, row);
      return row;
    },

    listAuditLogs(tripId) {
      return [...auditLogs.values()].filter((l) => l.tripId === tripId);
    },
  };
}