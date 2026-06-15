/**
 * /init_trip — create a trip for the current group.
 * See docs/details.md §2 (Trip Init Screen).
 */
import type { Bot } from "grammy";
import type { Ctx } from "../context";
import { isGroupChat } from "../middleware/access";
import type { Repository } from "../storage/repository";

function displayName(ctx: Ctx): string {
  const from = ctx.from!;
  if (from.username) return `@${from.username}`;
  return from.first_name ?? `user${from.id}`;
}

export function registerInitTrip(bot: Bot<Ctx>, repo: Repository): void {
  bot.command("init_trip", async (ctx) => {
    if (!isGroupChat(ctx) || !ctx.from) {
      await ctx.reply("/init_trip must be run in a group chat.");
      return;
    }

    const groupId = ctx.chat!.id;
    const existing = repo.getTripByGroupId(groupId);
    if (existing) {
      await ctx.reply(
        "This group already has a trip. Use /balances to see where you stand.",
      );
      return;
    }

    const name = displayName(ctx);
    const trip = repo.createTrip({
      telegramGroupId: groupId,
      organizerUserId: ctx.from.id,
      organizerDisplayName: name,
    });

    repo.appendAuditLog(trip.id, ctx.from.id, "trip_created");

    const count = repo.listActiveParticipants(trip.id).length;
    await ctx.reply(
      [
        "✅ Trip initialized!",
        `Organizer: ${name}`,
        `Participants: ${count}`,
        "Use /expense to log spending or /help for commands.",
      ].join("\n"),
    );
  });
}