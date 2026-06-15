/**
 * Button-first menu router — reply-keyboard labels and inline callbacks.
 */
import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import { showHelp } from "../actions/help";
import { runInitTrip } from "../actions/initTrip";
import { showBalances } from "../actions/balances";
import { promptExpenseAmount } from "../actions/expense";
import { showMembersMenu } from "../actions/members";
import { isGroupChat } from "../middleware/access";
import type { Repository } from "../storage/repository";
import { MENU } from "./labels";

async function notYet(ctx: Ctx, feature: string): Promise<void> {
  await ctx.reply(`${feature} is coming in the next update. Check back soon!`);
}

export function registerMenu(bot: Bot<Ctx>, repo: Repository): void {
  // ── Reply-keyboard taps ──────────────────────────────────────────────
  bot.hears(MENU.HELP, async (ctx) => showHelp(ctx, repo));
  bot.hears(MENU.START_TRIP, async (ctx) => runInitTrip(ctx, repo));

  bot.hears(MENU.LOG_EXPENSE, async (ctx) => {
    if (!ctx.trip) return;
    await promptExpenseAmount(ctx);
  });

  bot.hears(MENU.BALANCES, async (ctx) => {
    if (!ctx.trip) return;
    await showBalances(ctx, repo);
  });

  bot.hears(MENU.SUGGESTED, async (ctx) => {
    if (!ctx.trip) return;
    await notYet(ctx, "Suggested payments");
  });

  bot.hears(MENU.SETTLE, async (ctx) => {
    if (!ctx.trip) return;
    await notYet(ctx, "Settle");
  });

  bot.hears(MENU.MEMBERS, async (ctx) => {
    if (!ctx.trip) return;
    await showMembersMenu(ctx);
  });

  bot.hears(MENU.EXPORT, async (ctx) => {
    if (!ctx.trip) return;
    await notYet(ctx, "Export");
  });

  // ── Inline menu callbacks ────────────────────────────────────────────
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}menu:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (!isGroupChat(ctx) || !ctx.from) return;

    if (data === `${CB_PREFIX}menu:help`) {
      await showHelp(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}menu:start`) {
      await runInitTrip(ctx, repo);
      return;
    }

    const trip = repo.getTripByGroupId(ctx.chat!.id);
    const participant = trip
      ? repo.getParticipant(trip.id, ctx.from.id)
      : undefined;

    if (!trip || !participant?.active) {
      await ctx.reply("You're not a participant in this trip.");
      return;
    }

    ctx.trip = trip;
    ctx.participant = participant;

    switch (data) {
      case `${CB_PREFIX}menu:expense`:
        await promptExpenseAmount(ctx);
        return;
      case `${CB_PREFIX}menu:balances`:
        await showBalances(ctx, repo);
        return;
      case `${CB_PREFIX}menu:suggested`:
        await notYet(ctx, "Suggested payments");
        break;
      default:
        break;
    }
  });
}