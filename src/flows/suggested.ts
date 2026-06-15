import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import { getSuggestedPayment, showSuggested } from "../actions/suggested";
import { startSettlementFromSuggestion } from "./settle";
import type { Repository } from "../storage/repository";

export function registerSuggestedFlow(bot: Bot<Ctx>, repo: Repository): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}suggested:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (!ctx.trip) return;

    if (data === `${CB_PREFIX}suggested:refresh`) {
      await showSuggested(ctx, repo);
      return;
    }

    const match = data.match(
      new RegExp(`^${CB_PREFIX}suggested:settle:(\\d+)$`),
    );
    if (match) {
      const idx = Number(match[1]);
      const payment = getSuggestedPayment(ctx, idx);
      if (!payment) {
        await ctx.reply("Suggestion expired — tap 💸 Suggested to refresh.");
        return;
      }
      await startSettlementFromSuggestion(
        ctx,
        repo,
        payment.payerUserId,
        payment.payeeUserId,
        payment.amountCents,
      );
    }
  });
}