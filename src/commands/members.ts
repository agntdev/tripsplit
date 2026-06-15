/**
 * /add and /remove fallbacks — primary UX is 👥 Members buttons.
 */
import type { Bot } from "grammy";
import type { Ctx } from "../context";
import { addParticipant, removeParticipant } from "../actions/members";
import type { Repository } from "../storage/repository";
import { mentionLabel, resolveMention } from "../utils/mention";

export function registerMembersCommands(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("add", async (ctx) => {
    if (!ctx.trip || !ctx.from || !ctx.message) return;

    const resolved = resolveMention(ctx.message);
    if (!resolved) {
      const label = mentionLabel(ctx.message);
      if (label) {
        await ctx.reply(
          `Couldn't resolve ${label}. They must send a message in this group first.`,
        );
      } else {
        await ctx.reply("Usage: /add @username");
      }
      return;
    }

    await addParticipant(ctx, repo, resolved.userId, resolved.label);
  });

  bot.command("remove", async (ctx) => {
    if (!ctx.trip || !ctx.from || !ctx.message) return;

    const resolved = resolveMention(ctx.message);
    if (!resolved) {
      await ctx.reply("Usage: /remove @username");
      return;
    }

    const target = repo.getParticipant(ctx.trip.id, resolved.userId);
    if (!target) {
      await ctx.reply(`${resolved.label} is not an active participant.`);
      return;
    }

    await removeParticipant(ctx, repo, target);
  });
}