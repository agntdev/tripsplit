import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import { getSuggestedPayment, showSuggested } from "../actions/suggested";
import type { Repository } from "../storage/repository";
import { formatCents } from "../utils/amount";

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
      const payer = repo.getParticipant(ctx.trip.id, payment.payerUserId);
      const payee = repo.getParticipant(ctx.trip.id, payment.payeeUserId);
      await ctx.reply(
        [
          `Settlement hint #${idx + 1}:`,
          `${payer?.displayName ?? "payer"} → ${payee?.displayName ?? "payee"} ${formatCents(payment.amountCents)}`,
          "Tap ✅ Settle to start the confirmation flow (coming next).",
        ].join("\n"),
      );
    }
  });
}