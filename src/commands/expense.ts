/**
 * /expense fallback — primary UX is 💰 Log Expense button.
 */
import type { Bot } from "grammy";
import {
  promptExpenseAmount,
  startExpenseWithAmount,
} from "../actions/expense";
import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";
import { parseExpenseInput } from "../utils/expenseInput";

export function registerExpenseCommand(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("expense", async (ctx) => {
    if (!ctx.trip || !ctx.message?.text) return;

    const args = ctx.message.text.split(/\s+/).slice(1).join(" ").trim();
    if (!args) {
      await promptExpenseAmount(ctx);
      return;
    }

    const parsed = parseExpenseInput(args);
    if (!parsed) {
      await ctx.reply(
        "Couldn't parse amount. Example: /expense 12.50 coffee",
      );
      return;
    }

    await startExpenseWithAmount(
      ctx,
      repo,
      parsed.amountCents,
      parsed.description,
    );
  });
}