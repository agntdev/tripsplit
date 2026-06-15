import type { Bot } from "grammy";
import type { Ctx } from "../context";

const BUTTON_ONLY_HINT =
  "TripSplit uses buttons only — tap ❓ Help to see the menu.";

/** Reject legacy slash commands with a friendly nudge toward the keyboard. */
export function registerNoSlashCommands(bot: Bot<Ctx>): void {
  bot.on("message:entities:bot_command", async (ctx) => {
    await ctx.reply(BUTTON_ONLY_HINT);
  });
}