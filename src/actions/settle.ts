import { SETTLEMENT_EXPIRY_DAYS } from "../config";
import type { Ctx } from "../context";
import { computeBalances } from "../services/ledger";
import type { Repository } from "../storage/repository";
import {
  settlePayeeConfirmKeyboard,
  settlePayerKeyboard,
  settlePickPayeeKeyboard,
} from "../ui/keyboards";
import { formatCents, parseAmount } from "../utils/amount";

export async function startSettle(ctx: Ctx, repo: Repository): Promise<void> {
  if (!ctx.trip) return;
  const members = repo.listActiveParticipants(ctx.trip.id);
  const others = members.filter(
    (m) => m.telegramUserId !== ctx.from!.id,
  );
  if (others.length === 0) {
    await ctx.reply("No other participants to settle with.");
    return;
  }
  ctx.session.step = "settle_pick_payee";
  ctx.session.settleDraft = null;
  await ctx.reply("Who are you settling with?", {
    reply_markup: settlePickPayeeKeyboard(members, ctx.from!.id),
  });
}

export async function pickPayee(
  ctx: Ctx,
  repo: Repository,
  payeeUserId: number,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;
  const payee = repo.getParticipant(ctx.trip.id, payeeUserId);
  if (!payee?.active || payeeUserId === ctx.from.id) {
    await ctx.reply("Can't settle with that person.");
    return;
  }
  ctx.session.settleDraft = {
    payeeUserId,
    payeeName: payee.displayName,
  };
  ctx.session.step = "settle_amount";
  await ctx.reply(`How much to send to ${payee.displayName}? (e.g. 15.50)`);
}

export async function processSettleAmount(
  ctx: Ctx,
  repo: Repository,
  text: string,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;
  const draft = ctx.session.settleDraft;
  if (!draft) return;

  const amountCents = parseAmount(text);
  if (amountCents === null || amountCents <= 0) {
    await ctx.reply("Enter a valid positive amount (e.g. 15.50).");
    return;
  }

  const pairBalance = getPairBalance(
    ctx.trip.id,
    repo,
    ctx.from.id,
    draft.payeeUserId,
  );

  if (amountCents > pairBalance) {
    await ctx.reply(
      "That amount exceeds the suggested/ledger balance. Check /balances.",
    );
    return;
  }

  const expiresAt = new Date(
    Date.now() + SETTLEMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const settlement = repo.createSettlement({
    tripId: ctx.trip.id,
    payerUserId: ctx.from.id,
    payeeUserId: draft.payeeUserId,
    amountCents,
    expiresAt,
  });

  ctx.session.step = "idle";
  ctx.session.settleDraft = null;

  await ctx.reply(
    [
      `Settlement started: ${memberLabel(repo, ctx.trip.id, ctx.from.id)} → ${draft.payeeName} ${formatCents(amountCents)}`,
      `@${ctx.from.username ?? "user"}, confirm when you've paid:`,
    ].join("\n"),
    { reply_markup: settlePayerKeyboard(settlement.id) },
  );
}

function getPairBalance(
  tripId: number,
  repo: Repository,
  payerUserId: number,
  payeeUserId: number,
): number {
  const balances = computeBalances(tripId, repo);
  const payerBalance = balances.get(payerUserId) ?? 0;
  if (payerBalance >= 0) return 0;
  const payeeBalance = balances.get(payeeUserId) ?? 0;
  if (payeeBalance <= 0) return 0;
  return Math.min(Math.abs(payerBalance), payeeBalance);
}

function memberLabel(
  repo: Repository,
  tripId: number,
  userId: number,
): string {
  return repo.getParticipant(tripId, userId)?.displayName ?? `user${userId}`;
}

export async function handlePayerConfirm(
  ctx: Ctx,
  repo: Repository,
  settlementId: number,
): Promise<void> {
  const settlement = repo.getSettlement(settlementId);
  if (!settlement || settlement.status !== "pending") {
    await ctx.answerCallbackQuery({ text: "No pending settlement.", show_alert: true }).catch(() => {});
    return;
  }

  const actorId = ctx.callbackQuery?.from.id;
  if (actorId !== settlement.payerUserId) {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true }).catch(() => {});
    return;
  }

  repo.updateSettlement(settlementId, {
    payerConfirmedAt: new Date().toISOString(),
  });

  const payerName = memberLabel(repo, settlement.tripId, settlement.payerUserId);
  const payeeName = memberLabel(repo, settlement.tripId, settlement.payeeUserId);
  const amount = formatCents(settlement.amountCents);

  await ctx.reply(
    `${payerName} marked payment sent. Waiting for ${payeeName} to confirm.`,
  );

  try {
    await ctx.api.sendMessage(
      settlement.payeeUserId,
      `${payerName} says they paid you ${amount} for the trip.`,
      { reply_markup: settlePayeeConfirmKeyboard(settlementId) },
    );
  } catch {
    await ctx.reply(
      `I can't DM ${payeeName} yet. They need to tap Start in a private chat with me: t.me/${ctx.me.username ?? "bot"}?start=trip`,
    );
  }
}

export async function handlePayeeConfirm(
  ctx: Ctx,
  repo: Repository,
  settlementId: number,
): Promise<void> {
  const settlement = repo.getSettlement(settlementId);
  if (!settlement || settlement.status !== "pending") {
    await ctx.answerCallbackQuery({ text: "No pending settlement.", show_alert: true }).catch(() => {});
    return;
  }

  const actorId = ctx.callbackQuery?.from.id;
  if (actorId !== settlement.payeeUserId) {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true }).catch(() => {});
    return;
  }

  repo.updateSettlement(settlementId, {
    payeeConfirmedAt: new Date().toISOString(),
    status: "cleared",
  });

  repo.appendAuditLog(settlement.tripId, actorId, "settlement_cleared", {
    settlement_id: settlementId,
  });

  const payerName = memberLabel(repo, settlement.tripId, settlement.payerUserId);
  const payeeName = memberLabel(repo, settlement.tripId, settlement.payeeUserId);
  const amount = formatCents(settlement.amountCents);

  const trip = repo.getTripById(settlement.tripId);
  if (trip) {
    try {
      await ctx.api.sendMessage(
        trip.telegramGroupId,
        `✅ Settlement cleared: ${payerName} → ${payeeName} ${amount}`,
      );
    } catch {
      // group may not be reachable
    }
  }

  await ctx.reply("Receipt confirmed. Thanks!");
}

export async function handleDispute(
  ctx: Ctx,
  repo: Repository,
  settlementId: number,
): Promise<void> {
  const settlement = repo.getSettlement(settlementId);
  if (!settlement || settlement.status !== "pending") {
    await ctx.answerCallbackQuery({ text: "No pending settlement.", show_alert: true }).catch(() => {});
    return;
  }

  const actorId = ctx.callbackQuery?.from.id;
  if (actorId !== settlement.payeeUserId) {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true }).catch(() => {});
    return;
  }

  await ctx.reply(
    "Marked as disputed. Ask the organizer for /trip_summary or settle again when resolved.",
  );
}

export async function handleCancel(
  ctx: Ctx,
  repo: Repository,
  settlementId: number | undefined,
): Promise<void> {
  if (settlementId !== undefined) {
    const settlement = repo.getSettlement(settlementId);
    if (!settlement || settlement.status !== "pending") {
      await ctx.answerCallbackQuery({ text: "No pending settlement.", show_alert: true }).catch(() => {});
      return;
    }
    const actorId = ctx.callbackQuery?.from.id ?? ctx.from?.id;
    if (actorId !== settlement.payerUserId) {
      await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true }).catch(() => {});
      return;
    }
    repo.updateSettlement(settlementId, { status: "expired" });
    await ctx.reply("Settlement cancelled.");
  } else {
    ctx.session.step = "idle";
    ctx.session.settleDraft = null;
    await ctx.reply("Cancelled.");
  }
}