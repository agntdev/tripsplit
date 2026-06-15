/**
 * Trip access-control middleware.
 * See docs/details.md §ACCESS CONTROL MIDDLEWARE.
 */
import type { Middleware } from "grammy";
import type { Repository } from "../storage/repository";
import type { Participant, Trip } from "../types";
import type { Ctx } from "../context";

export interface TripContext {
  trip: Trip;
  participant: Participant;
}

/** Commands that skip the trip/participant guard. */
export const PUBLIC_COMMANDS = new Set(["help"]);

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

/**
 * Middleware: for group commands (except /help), require an active trip and
 * active participant. Sets `ctx.trip` and `ctx.participant` on success.
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
    if (cmd && PUBLIC_COMMANDS.has(cmd)) {
      await next();
      return;
    }

    if (!cmd) {
      await next();
      return;
    }

    const groupId = ctx.chat!.id;
    const trip = repo.getTripByGroupId(groupId);
    if (!trip) {
      await ctx.reply("No trip here yet. Run /init_trip first.");
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

/**
 * Guard for callback queries: ensure the actor is the intended user.
 */
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

/**
 * Load trip + active participant for a group callback (no reply on failure).
 */
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