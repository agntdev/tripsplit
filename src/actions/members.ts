import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";
import type { Participant } from "../types";
import {
  membersMenuKeyboard,
  removeMemberKeyboard,
} from "../ui/keyboards";

export async function showMembersMenu(ctx: Ctx): Promise<void> {
  if (!ctx.trip) return;
  await ctx.reply("Manage trip members:", {
    reply_markup: membersMenuKeyboard(),
  });
}

export async function listMembers(ctx: Ctx, repo: Repository): Promise<void> {
  if (!ctx.trip) return;
  const members = repo.listActiveParticipants(ctx.trip.id);
  if (members.length === 0) {
    await ctx.reply("No active members.");
    return;
  }
  const lines = members.map((m) => `• ${m.displayName}`);
  await ctx.reply(
    [`Members (${members.length}):`, ...lines].join("\n"),
    { reply_markup: membersMenuKeyboard() },
  );
}

export async function addParticipant(
  ctx: Ctx,
  repo: Repository,
  userId: number,
  label: string,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;

  repo.upsertParticipant(ctx.trip.id, userId, label);
  repo.appendAuditLog(ctx.trip.id, ctx.from.id, "participant_added", {
    added_user_id: userId,
  });

  ctx.session.step = "idle";
  await ctx.reply(`Added ${label} to the trip.`, {
    reply_markup: membersMenuKeyboard(),
  });
}

export async function promptAddMember(ctx: Ctx): Promise<void> {
  ctx.session.step = "awaiting_add_member";
  await ctx.reply(
    "Tag someone to add — send a message with @username (they must have posted in this group).",
    { reply_markup: membersMenuKeyboard() },
  );
}

export async function showRemovePicker(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip) return;
  const members = repo.listActiveParticipants(ctx.trip.id);
  if (members.length <= 1) {
    await ctx.reply("Can't remove the last member.", {
      reply_markup: membersMenuKeyboard(),
    });
    return;
  }
  await ctx.reply("Select a member to remove:", {
    reply_markup: removeMemberKeyboard(members),
  });
}

export async function removeParticipant(
  ctx: Ctx,
  repo: Repository,
  target: Participant,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;

  const removed = repo.deactivateParticipant(
    ctx.trip.id,
    target.telegramUserId,
  );
  if (!removed) {
    await ctx.reply(`${target.displayName} is not an active participant.`, {
      reply_markup: membersMenuKeyboard(),
    });
    return;
  }

  repo.appendAuditLog(ctx.trip.id, ctx.from.id, "participant_removed", {
    removed_user_id: target.telegramUserId,
  });

  await ctx.reply(
    `${target.displayName} removed. Past expenses still count toward their balance.`,
    { reply_markup: membersMenuKeyboard() },
  );
}