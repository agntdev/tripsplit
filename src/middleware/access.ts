/**
 * Trip access-control middleware.
 * Guards slash commands and reply-keyboard menu taps (button-first UX).
 */
import type { Middleware } from "grammy";
import {
  ALL_MENU_LABELS,
  PUBLIC_MENU_LABELS,
} from "../ui/labels";
import type { Repository } from "../storage/repository";
import type { Participant, Trip } from "../types";
import type { Ctx } from "../context";

export interface TripContext {
  trip: Trip;
  participant: Participant;
}

/** Commands that skip the trip/participant guard. */
export const PUBLIC_COMMANDS = new Set(["help", "init_trip"]);

export function isGroupChat(ctx: Ctx): boolean {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function commandName(ctx: Ctx): string | undefined {
  const text = ctx.message?.text;
  if (!text) return undefined;
  const entity = ctx.message?.entities?.find((e) => e.type === "bot_command");
  if (!entity) return undefined;
  const raw = text.slice(entity.offset, entity.offset + entity.length);
  return raw.replace(/@\w+$/, "").slice(1).toLowerCase();
}

function menuLabel(ctx: Ctx): string | undefined {
  const text = ctx.message?.text?.trim();
  if (!text || commandName(ctx)) return undefined;
  if (ALL_MENU_LABELS.has(text)) return text;
  return undefined;
}

/**
 * Middleware: for group commands and menu-button taps (except public ones),
 * require an active trip and active participant.
 */
export function tripAccessMiddleware(
  repo: Repository,
): Middleware<Ctx> {
  return async (ctx, next) => {
    if (!isGroupChat(ctx) || !ctx.from) {
      await next();
      return;
    }

    const cmd = commandName(ctx);
    const label = menuLabel(ctx);

    if (cmd && PUBLIC_COMMANDS.has(cmd)) {
      await next();
      return;
    }

    if (label && PUBLIC_MENU_LABELS.has(label)) {
      await next();
      return;
    }

    if (!cmd && !label) {
      await next();
      return;
    }

    const groupId = ctx.chat!.id;
    const trip = repo.getTripByGroupId(groupId);
    if (!trip) {
      await ctx.reply("No trip here yet. Tap 🚀 Start Trip to begin.");
      return;
    }

    const participant = repo.getParticipant(trip.id, ctx.from.id);
    if (!participant?.active) {
      await ctx.reply("You're not a participant in this trip.");
      return;
    }

    ctx.trip = trip;
    ctx.participant = participant;
    await next();
  };
}

export async function assertCallbackActor(
  ctx: Ctx,
  expectedUserId: number,
): Promise<boolean> {
  const actorId = ctx.callbackQuery?.from.id;
  if (actorId !== expectedUserId) {
    await ctx.answerCallbackQuery({
      text: "Not yours",
      show_alert: true,
    });
    return false;
  }
  return true;
}

export function loadTripParticipant(
  repo: Repository,
  groupId: number,
  userId: number,
): TripContext | undefined {
  const trip = repo.getTripByGroupId(groupId);
  if (!trip) return undefined;
  const participant = repo.getParticipant(trip.id, userId);
  if (!participant?.active) return undefined;
  return { trip, participant };
}

