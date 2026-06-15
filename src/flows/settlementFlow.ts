import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import {
  handleCancel,
  handleDispute,
  handlePayerConfirm,
  handlePayeeConfirm,
  pickPayee,
  processSettleAmount,
} from "../actions/settle";
import type { Repository } from "../storage/repository";

const SETTLE_TEXT_STEPS = new Set(["settle_amount"]);

export function registerSettlementFlow(
  bot: Bot<Ctx>,
  repo: Repository,
): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}settle:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery().catch(() => {});

    if (data === `${CB_PREFIX}settle:cancel`) {
      await handleCancel(ctx, repo, undefined);
      return;
    }

    const pickMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:pick:(\\d+)$`),
    );
    if (pickMatch) {
      await pickPayee(ctx, repo, Number(pickMatch[1]));
      return;
    }

    const paidMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:paid:(\\d+)$`),
    );
    if (paidMatch) {
      await handlePayerConfirm(ctx, repo, Number(paidMatch[1]));
      return;
    }

    const confirmMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:confirm:(\\d+)$`),
    );
    if (confirmMatch) {
      await handlePayeeConfirm(ctx, repo, Number(confirmMatch[1]));
      return;
    }

    const disputeMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:dispute:(\\d+)$`),
    );
    if (disputeMatch) {
      await handleDispute(ctx, repo, Number(disputeMatch[1]));
      return;
    }

    const cancelMatch = data.match(
      new RegExp(`^${CB_PREFIX}settle:cancel:(\\d+)$`),
    );
    if (cancelMatch) {
      await handleCancel(ctx, repo, Number(cancelMatch[1]));
      return;
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (!SETTLE_TEXT_STEPS.has(ctx.session.step)) {
      await next();
      return;
    }

    const text = ctx.message.text.trim();

    if (ctx.session.step === "settle_amount") {
      await processSettleAmount(ctx, repo, text);
      return;
    }
  });
}