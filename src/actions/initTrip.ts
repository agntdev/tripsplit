import type { Ctx } from "../context";
import { isGroupChat } from "../middleware/access";
import type { Repository } from "../storage/repository";
import { mainMenuReplyKeyboard } from "../ui/keyboards";

function displayName(ctx: Ctx): string {
  const from = ctx.from!;
  if (from.username) return `@${from.username}`;
  return from.first_name ?? `user${from.id}`;
}

export async function runInitTrip(ctx: Ctx, repo: Repository): Promise<void> {
  if (!isGroupChat(ctx) || !ctx.from) {
    await ctx.reply("Start a trip from a group chat.");
    return;
  }

  const groupId = ctx.chat!.id;
  const existing = repo.getTripByGroupId(groupId);
  if (existing) {
    await ctx.reply("This group already has a trip. Tap 📊 Balances to see where you stand.", {
      reply_markup: mainMenuReplyKeyboard(),
    });
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
      "Use the buttons below to log expenses and track balances.",
    ].join("\n"),
    { reply_markup: mainMenuReplyKeyboard() },
  );
}