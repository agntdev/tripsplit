/**
 * /help command — static command reference.
 * See docs/details.md §1 (Help Screen).
 */
import type { Bot } from "grammy";
import type { Ctx } from "../context";

export const HELP_TEXT = [
  "TripSplit — shared trip expenses",
  "",
  "/init_trip        Start a trip for this group",
  "/add @user        Add a participant",
  "/remove @user     Remove a participant",
  "/expense <amt>    Log an expense (interactive)",
  "/balances         Show net balances",
  "/suggested        Minimal repayment suggestions",
  "/settle @user <amt>  Start a settlement",
  "/trip_summary     Audit CSV export (sent to your DM)",
].join("\n");

export function registerHelp(bot: Bot<Ctx>): void {
  bot.command("help", async (ctx) => {
    await ctx.reply(HELP_TEXT);
  });
}