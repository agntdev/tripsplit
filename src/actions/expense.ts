import type { Ctx } from "../context";
import {
  computeBalances,
  formatBalanceLine,
} from "../services/ledger";
import {
  finalizeCustomCents,
  roundingNote,
  splitCustomPercent,
  splitEven,
  type ShareLine,
} from "../services/split";
import type { Repository } from "../storage/repository";
import type { ExpenseDraft, Participant } from "../types";
import {
  confirmExpenseKeyboard,
  participantsKeyboard,
  payerKeyboard,
  pickPeopleKeyboard,
  splitTypeKeyboard,
} from "../ui/expenseKeyboards";
import { formatCents } from "../utils/amount";

export function newExpenseDraft(
  amountCents: number,
  description: string,
): ExpenseDraft {
  return {
    amountCents,
    description,
    payerUserId: null,
    participantUserIds: [],
    splitMode: null,
    shares: [],
    customCursor: 0,
    percentByUser: {},
  };
}

export function cancelExpense(ctx: Ctx): void {
  ctx.session.step = "idle";
  ctx.session.draft = null;
}

function memberName(
  repo: Repository,
  tripId: number,
  userId: number,
): string {
  return repo.getParticipant(tripId, userId)?.displayName ?? `user${userId}`;
}

function draftOrThrow(ctx: Ctx): ExpenseDraft {
  if (!ctx.session.draft) throw new Error("missing expense draft");
  return ctx.session.draft;
}

export async function promptExpenseAmount(ctx: Ctx): Promise<void> {
  ctx.session.step = "expense_amount";
  ctx.session.draft = null;
  await ctx.reply(
    "Enter amount and optional description:\nExample: 48.50 dinner",
  );
}

export async function startExpenseWithAmount(
  ctx: Ctx,
  repo: Repository,
  amountCents: number,
  description: string,
): Promise<void> {
  ctx.session.draft = newExpenseDraft(amountCents, description);
  await showPayerStep(ctx, repo);
}

export async function showPayerStep(ctx: Ctx, repo: Repository): Promise<void> {
  if (!ctx.trip) return;
  const draft = draftOrThrow(ctx);
  ctx.session.step = "expense_payer";
  const members = repo.listActiveParticipants(ctx.trip.id);
  const desc = draft.description ? ` — ${draft.description}` : "";
  await ctx.reply(
    `New expense: ${formatCents(draft.amountCents)}${desc}\nWho paid?`,
    { reply_markup: payerKeyboard(members) },
  );
}

export async function showParticipantsStep(ctx: Ctx): Promise<void> {
  const draft = draftOrThrow(ctx);
  ctx.session.step = "expense_participants";
  await ctx.reply("Split among whom?", {
    reply_markup: participantsKeyboard(),
  });
}

export async function showPickPeopleStep(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip) return;
  const draft = draftOrThrow(ctx);
  ctx.session.step = "expense_pick_people";
  const members = repo.listActiveParticipants(ctx.trip.id);
  const selected = new Set(draft.participantUserIds);
  await ctx.reply("Select participants:", {
    reply_markup: pickPeopleKeyboard(members, selected),
  });
}

export async function showSplitTypeStep(ctx: Ctx): Promise<void> {
  const draft = draftOrThrow(ctx);
  ctx.session.step = "expense_split_type";
  await ctx.reply(`How to split ${formatCents(draft.amountCents)}?`, {
    reply_markup: splitTypeKeyboard(),
  });
}

export async function promptCustomAmount(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip) return;
  const draft = draftOrThrow(ctx);
  const userId = draft.participantUserIds[draft.customCursor];
  const name = memberName(repo, ctx.trip.id, userId);
  await ctx.reply(
    `How much for ${name}? (e.g. 16.50 or 1650 cents)`,
  );
}

export async function promptCustomPercent(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip) return;
  const draft = draftOrThrow(ctx);
  const userId = draft.participantUserIds[draft.customCursor];
  const name = memberName(repo, ctx.trip.id, userId);
  await ctx.reply(`What percent for ${name}? (0–100)`);
}

function formatShareSummary(
  repo: Repository,
  tripId: number,
  draft: ExpenseDraft,
  shares: ShareLine[],
): string {
  const parts = shares.map(
    (s) => `${memberName(repo, tripId, s.userId)} ${formatCents(s.shareCents)}`,
  );
  const mode =
    draft.splitMode === "even"
      ? `even among ${shares.length}`
      : draft.splitMode === "cents"
        ? "custom amounts"
        : "custom %";
  let text = `Split: ${mode} → ${parts.join(", ")}`;
  if (draft.payerUserId) {
    const note = roundingNote(
      draft.amountCents,
      shares,
      draft.payerUserId,
    );
    if (note) text += `\n${note}`;
  }
  return text;
}

export async function showConfirmStep(
  ctx: Ctx,
  repo: Repository,
  shares: ShareLine[],
): Promise<void> {
  if (!ctx.trip) return;
  const draft = draftOrThrow(ctx);
  draft.shares = shares;
  ctx.session.step = "expense_confirm";
  const payer = draft.payerUserId
    ? memberName(repo, ctx.trip.id, draft.payerUserId)
    : "?";
  await ctx.reply(
    [
      "Confirm expense:",
      `Payer: ${payer}`,
      formatShareSummary(repo, ctx.trip.id, draft, shares),
    ].join("\n"),
    { reply_markup: confirmExpenseKeyboard() },
  );
}

export async function applyEvenSplit(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  const draft = draftOrThrow(ctx);
  if (!draft.payerUserId) return;
  draft.splitMode = "even";
  const shares = splitEven(
    draft.amountCents,
    draft.participantUserIds,
    draft.payerUserId,
  );
  await showConfirmStep(ctx, repo, shares);
}

export async function postExpense(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;
  const draft = draftOrThrow(ctx);
  if (!draft.payerUserId || draft.shares.length === 0) return;

  repo.createExpense({
    tripId: ctx.trip.id,
    payerUserId: draft.payerUserId,
    amountCents: draft.amountCents,
    description: draft.description,
    shares: draft.shares.map((s) => ({
      participantUserId: s.userId,
      shareCents: s.shareCents,
    })),
  });
  repo.appendAuditLog(ctx.trip.id, ctx.from.id, "expense_created", {
    amount_cents: draft.amountCents,
  });

  const balances = computeBalances(ctx.trip.id, repo);
  const members = repo.listActiveParticipants(ctx.trip.id);
  const balanceLines = members
    .map((m) => {
      const cents = balances.get(m.telegramUserId) ?? 0;
      return formatBalanceLine(m.displayName, cents);
    })
    .join("\n");

  const payer = memberName(repo, ctx.trip.id, draft.payerUserId);
  const desc = draft.description ? ` for ${draft.description}` : "";

  cancelExpense(ctx);

  await ctx.reply(
    [
      `✅ Logged: ${payer} paid ${formatCents(draft.amountCents)}${desc}`,
      "Updated balances:",
      balanceLines,
    ].join("\n"),
  );
}

export function resolveParticipants(
  repo: Repository,
  tripId: number,
): Participant[] {
  return repo.listActiveParticipants(tripId);
}