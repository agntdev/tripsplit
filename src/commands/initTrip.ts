/**
 * /init_trip fallback — primary UX is the 🚀 Start Trip button.
 */
import type { Bot } from "grammy";
import { runInitTrip } from "../actions/initTrip";
import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";

export function registerInitTrip(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("init_trip", async (ctx) => runInitTrip(ctx, repo));
}