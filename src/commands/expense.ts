import type { Bot } from "grammy";
import type { Ctx } from "../context";
import { startExpenseFromArgs } from "../actions/expense";
import type { Repository } from "../storage/repository";

export function registerExpense(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("expense", async (ctx) => {
    if (!ctx.trip || !ctx.from || !ctx.message) return;

    const match = ctx.message.text?.match(
      /^\/expense(?:@\w+)?\s+(\S+)(?:\s+(.*))?$/s,
    );
    if (!match) {
      await ctx.reply(
        "Usage: /expense <amount> [description]\nExample: /expense 48.50 dinner",
      );
      return;
    }

    const amountStr = match[1];
    const description = match[2]?.trim() || undefined;
    await startExpenseFromArgs(ctx, repo, amountStr, description);
  });
}
