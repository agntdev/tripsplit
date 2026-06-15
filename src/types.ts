/**
 * Shared domain types for TripSplit.
 * See docs/design.md §1.5 and docs/details.md §SESSION MODEL.
 */

export type SessionStep =
  | "idle"
  | "awaiting_add_member"
  | "expense_amount"
  | "expense_payer"
  | "expense_participants"
  | "expense_pick_people"
  | "expense_split_type"
  | "expense_custom_amounts"
  | "expense_custom_percent"
  | "expense_confirm";

export interface ExpenseDraft {
  amountCents: number;
  description: string;
  payerUserId: number | null;
  participantUserIds: number[];
  splitMode: "even" | "cents" | "percent" | null;
  shares: Array<{ userId: number; shareCents: number }>;
  /** Index into participantUserIds for sequential custom input. */
  customCursor: number;
  /** Collected percents during custom % wizard. */
  percentByUser: Record<number, number>;
}

export interface Session {
  step: SessionStep;
  draft: ExpenseDraft | null;
}

export const initialSession = (): Session => ({
  step: "idle",
  draft: null,
});

export type SettlementStatus = "pending" | "cleared" | "expired";

export interface Trip {
  id: number;
  telegramGroupId: number;
  organizerUserId: number;
  createdAt: string;
}

export interface Participant {
  id: number;
  tripId: number;
  telegramUserId: number;
  displayName: string;
  active: boolean;
  joinedAt: string;
  removedAt: string | null;
}

export interface Expense {
  id: number;
  tripId: number;
  payerUserId: number;
  amountCents: number;
  description: string;
  createdAt: string;
}

export interface Share {
  id: number;
  expenseId: number;
  participantUserId: number;
  shareCents: number;
}

export interface Settlement {
  id: number;
  tripId: number;
  payerUserId: number;
  payeeUserId: number;
  amountCents: number;
  status: SettlementStatus;
  payerConfirmedAt: string | null;
  payeeConfirmedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export type AuditAction =
  | "trip_created"
  | "participant_added"
  | "participant_removed"
  | "expense_created"
  | "settlement_cleared"
  | "export_requested";

export interface AuditLog {
  id: number;
  tripId: number;
  actorUserId: number;
  action: AuditAction;
  payloadJson: string;
  createdAt: string;
}