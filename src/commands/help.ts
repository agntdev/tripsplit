/**
 * /help fallback — primary UX is the ❓ Help button.
 */
import type { Bot } from "grammy";
import { showHelp } from "../actions/help";
import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";

export function registerHelp(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("help", async (ctx) => showHelp(ctx, repo));
}