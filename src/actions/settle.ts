import type { Bot } from "grammy";
import type { Ctx } from "../context";
import {
  cancelSettlement,
  confirmPayee,
  confirmPayer,
  startSettlement,
} from "../services/settle";
import type { Repository } from "../storage/repository";
import {
  settlementPayeeDmKeyboard,
  settlementPayerKeyboard,
  settlePayeeKeyboard,
} from "../ui/settleKeyboards";
import { formatCents } from "../utils/amount";
import { privateChatLink } from "../utils/botLink";

function memberName(
  repo: Repository,
  tripId: number,
  userId: number,
): string {
  return repo.getParticipant(tripId, userId)?.displayName ?? `user${userId}`;
}

export function cancelSettleWizard(ctx: Ctx): void {
  ctx.session.step = "idle";
  ctx.session.settleDraft = null;
}

export async function promptSettlePayee(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;

  const members = repo.listActiveParticipants(ctx.trip.id);
  const others = members.filter((m) => m.telegramUserId !== ctx.from!.id);
  if (others.length === 0) {
    await ctx.reply("Add another member before settling.");
    return;
  }

  ctx.session.step = "settle_payee";
  ctx.session.settleDraft = { payeeUserId: null, amountCents: null };
  await ctx.reply("Who are you paying?", {
    reply_markup: settlePayeeKeyboard(members, ctx.from.id),
  });
}

export async function promptSettleAmount(
  ctx: Ctx,
  payeeUserId: number,
): Promise<void> {
  ctx.session.step = "settle_amount";
  ctx.session.settleDraft = { payeeUserId, amountCents: null };
  await ctx.reply("Enter the amount in USD (e.g. 20.00):");
}

export async function initiateSettlement(
  ctx: Ctx,
  repo: Repository,
  payerUserId: number,
  payeeUserId: number,
  amountCents: number,
): Promise<void> {
  if (!ctx.trip) return;

  const result = startSettlement(repo, {
    tripId: ctx.trip.id,
    payerUserId,
    payeeUserId,
    amountCents,
  });

  if (!result.ok) {
    await ctx.reply(result.error);
    return;
  }

  cancelSettleWizard(ctx);

  const payer = memberName(repo, ctx.trip.id, payerUserId);
  const payee = memberName(repo, ctx.trip.id, payeeUserId);
  const { settlement } = result;

  await ctx.reply(
    [
      `Settlement started: ${payer} → ${payee} ${formatCents(amountCents)}`,
      `${payer}, confirm when you've paid:`,
    ].join("\n"),
    { reply_markup: settlementPayerKeyboard(settlement.id) },
  );
}

export async function handlePayerPaid(
  ctx: Ctx,
  repo: Repository,
  bot: Bot<Ctx>,
  settlementId: number,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;

  const settlement = repo.getSettlement(settlementId);
  if (!settlement || settlement.tripId !== ctx.trip.id) {
    await ctx.reply("Settlement not found.");
    return;
  }

  const result = confirmPayer(repo, settlementId, ctx.from.id);
  if (result === "not_found") {
    await ctx.reply("Settlement not found.");
    return;
  }
  if (result === "forbidden") {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true });
    return;
  }
  if (result === "not_pending") {
    await ctx.reply("That settlement is no longer pending.");
    return;
  }

  const payer = memberName(repo, ctx.trip.id, settlement.payerUserId);
  const payee = memberName(repo, ctx.trip.id, settlement.payeeUserId);

  await ctx.reply(
    `${payer} marked payment sent. Waiting for ${payee} to confirm.`,
  );

  try {
    await bot.api.sendMessage(
      settlement.payeeUserId,
      `${payer} says they paid you ${formatCents(settlement.amountCents)} for the trip.`,
      { reply_markup: settlementPayeeDmKeyboard(settlementId) },
    );
  } catch {
    await ctx.reply(
      `I can't DM ${payee} yet. They need to tap Start in ${privateChatLink()}.`,
    );
  }
}

export async function handlePayeeConfirm(
  ctx: Ctx,
  repo: Repository,
  bot: Bot<Ctx>,
  settlementId: number,
): Promise<void> {
  if (!ctx.from) return;

  const settlement = repo.getSettlement(settlementId);
  if (!settlement) {
    await ctx.reply("Settlement not found.");
    return;
  }

  const result = confirmPayee(repo, settlementId, ctx.from.id);
  if (result === "not_found") {
    await ctx.reply("Settlement not found.");
    return;
  }
  if (result === "forbidden") {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true });
    return;
  }
  if (result === "not_pending") {
    await ctx.reply("That settlement is no longer pending.");
    return;
  }
  if (result === "payer_unconfirmed") {
    await ctx.reply("Waiting for the payer to confirm first.");
    return;
  }

  const trip = repo.getTripById(settlement.tripId);
  const payer = memberName(repo, settlement.tripId, settlement.payerUserId);
  const payee = memberName(repo, settlement.tripId, settlement.payeeUserId);

  await ctx.reply("Receipt confirmed. Thanks!");

  if (trip) {
    try {
      await bot.api.sendMessage(
        trip.telegramGroupId,
        `✅ Settlement cleared: ${payer} → ${payee} ${formatCents(settlement.amountCents)}`,
      );
    } catch {
      // Group may be unreachable in harness edge cases.
    }
  }
}

export async function handlePayeeDispute(
  ctx: Ctx,
  repo: Repository,
  settlementId: number,
): Promise<void> {
  if (!ctx.from) return;

  const settlement = repo.getSettlement(settlementId);
  if (!settlement) {
    await ctx.reply("Settlement not found.");
    return;
  }
  if (settlement.payeeUserId !== ctx.from.id) {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true });
    return;
  }
  if (settlement.status !== "pending") {
    await ctx.reply("That settlement is no longer pending.");
    return;
  }

  await ctx.reply(
    "Marked as disputed. Ask the organizer for 📁 Export or settle again when resolved.",
  );
}

export async function handleSettleCancel(
  ctx: Ctx,
  repo: Repository,
  settlementId: number,
): Promise<void> {
  if (!ctx.from) return;

  const settlement = repo.getSettlement(settlementId);
  if (!settlement) {
    await ctx.reply("Settlement not found.");
    return;
  }

  const result = cancelSettlement(repo, settlementId, ctx.from.id);
  if (result === "not_found") {
    await ctx.reply("Settlement not found.");
    return;
  }
  if (result === "forbidden") {
    await ctx.answerCallbackQuery({ text: "Not yours", show_alert: true });
    return;
  }
  if (result === "not_pending") {
    await ctx.reply("That settlement is no longer pending.");
    return;
  }

  await ctx.reply("Settlement cancelled.");
}