import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import {
  cancelSettleWizard,
  handlePayerPaid,
  handlePayeeConfirm,
  handlePayeeDispute,
  handleSettleCancel,
  initiateSettlement,
  promptSettleAmount,
  promptSettlePayee,
} from "../actions/settle";
import { isGroupChat } from "../middleware/access";
import type { Repository } from "../storage/repository";
import { parseAmount } from "../utils/amount";

export function registerSettleFlow(bot: Bot<Ctx>, repo: Repository): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}settle:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    const paidMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:paid:(\\d+)$`),
    );
    if (paidMatch) {
      if (!isGroupChat(ctx) || !ctx.trip) return;
      await handlePayerPaid(ctx, repo, bot, Number(paidMatch[1]));
      return;
    }

    const cancelMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:cancel:(\\d+)$`),
    );
    if (cancelMatch) {
      if (!isGroupChat(ctx) || !ctx.trip) return;
      await handleSettleCancel(ctx, repo, Number(cancelMatch[1]));
      return;
    }

    const confirmMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:confirm:(\\d+)$`),
    );
    if (confirmMatch) {
      if (ctx.chat?.type !== "private") return;
      await handlePayeeConfirm(ctx, repo, bot, Number(confirmMatch[1]));
      return;
    }

    const disputeMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:dispute:(\\d+)$`),
    );
    if (disputeMatch) {
      if (ctx.chat?.type !== "private") return;
      await handlePayeeDispute(ctx, repo, Number(disputeMatch[1]));
      return;
    }

    if (data === `${CB_PREFIX}settle:cancel_wizard`) {
      if (!isGroupChat(ctx)) return;
      cancelSettleWizard(ctx);
      await ctx.reply("Cancelled.");
      return;
    }

    const payeeMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:payee:(\\d+)$`),
    );
    if (payeeMatch) {
      if (!isGroupChat(ctx) || !ctx.trip || !ctx.from) return;
      await promptSettleAmount(ctx, Number(payeeMatch[1]));
      return;
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "settle_amount" || !ctx.trip || !ctx.from) {
      await next();
      return;
    }

    const draft = ctx.session.settleDraft;
    if (!draft?.payeeUserId) {
      cancelSettleWizard(ctx);
      await next();
      return;
    }

    const amountCents = parseAmount(ctx.message.text);
    if (amountCents === null || amountCents <= 0) {
      await ctx.reply("Enter a valid amount (e.g. 20.00).");
      return;
    }

    await initiateSettlement(
      ctx,
      repo,
      ctx.from.id,
      draft.payeeUserId,
      amountCents,
    );
  });
}

export async function startSettlementFromSuggestion(
  ctx: Ctx,
  repo: Repository,
  payerUserId: number,
  payeeUserId: number,
  amountCents: number,
): Promise<void> {
  if (!ctx.from) return;

  if (ctx.from.id !== payerUserId) {
    const payer = repo.getParticipant(ctx.trip!.id, payerUserId);
    await ctx.reply(
      `Only ${payer?.displayName ?? "the payer"} can start this settlement.`,
    );
    return;
  }

  await initiateSettlement(ctx, repo, payerUserId, payeeUserId, amountCents);
}

export { promptSettlePayee };