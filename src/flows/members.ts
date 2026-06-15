/**
 * Members flow — inline buttons + @mention capture for adding.
 */
import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import {
  addParticipant,
  listMembers,
  promptAddMember,
  removeParticipant,
  showMembersMenu,
  showRemovePicker,
} from "../actions/members";
import type { Repository } from "../storage/repository";
import { mentionLabel, resolveMention } from "../utils/mention";

export function registerMembersFlow(bot: Bot<Ctx>, repo: Repository): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}members:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (!ctx.trip || !ctx.from) return;

    if (data === `${CB_PREFIX}members:back`) {
      await showMembersMenu(ctx);
      return;
    }

    if (data === `${CB_PREFIX}members:add`) {
      await promptAddMember(ctx);
      return;
    }

    if (data === `${CB_PREFIX}members:remove`) {
      await showRemovePicker(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}members:list`) {
      await listMembers(ctx, repo);
      return;
    }

    const rmMatch = data.match(new RegExp(`^${CB_PREFIX}members:rm:(\\d+)$`));
    if (rmMatch) {
      const userId = Number(rmMatch[1]);
      const target = repo.getParticipant(ctx.trip.id, userId);
      if (!target?.active) {
        await ctx.reply("That member is not active.");
        return;
      }
      await removeParticipant(ctx, repo, target);
      return;
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.step !== "awaiting_add_member" || !ctx.trip || !ctx.from) {
      await next();
      return;
    }

    const resolved = ctx.message ? resolveMention(ctx.message) : null;
    if (!resolved) {
      const label = ctx.message ? mentionLabel(ctx.message) : null;
      if (label) {
        await ctx.reply(
          `Couldn't resolve ${label}. They must send a message in this group first.`,
        );
      } else {
        await ctx.reply("Send a message with @username to add someone.");
      }
      return;
    }

    await addParticipant(ctx, repo, resolved.userId, resolved.label);
  });
}