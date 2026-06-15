/**
 * /balances fallback — primary UX is 📊 Balances button.
 */
import type { Bot } from "grammy";
import { showBalances } from "../actions/balances";
import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";

export function registerBalancesCommand(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("balances", async (ctx) => {
    if (!ctx.trip) return;
    await showBalances(ctx, repo);
  });
}