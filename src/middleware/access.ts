/**
 * Trip access-control middleware.
 * Guards reply-keyboard menu taps (button-only UX).
 */
import type { Middleware } from "grammy";
import { CB_PREFIX } from "../config";
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

const PUBLIC_CALLBACKS = new Set([
  `${CB_PREFIX}menu:help`,
  `${CB_PREFIX}menu:start`,
]);

export function isGroupChat(ctx: Ctx): boolean {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

function menuLabel(ctx: Ctx): string | undefined {
  const text = ctx.message?.text?.trim();
  if (!text) return undefined;
  if (ALL_MENU_LABELS.has(text)) return text;
  return undefined;
}

/**
 * Middleware: menu-button taps (except public pre-trip ones) require an
 * active trip and active participant. Wizard text input passes through when
 * step !== idle.
 */
export function tripAccessMiddleware(
  repo: Repository,
): Middleware<Ctx> {
  return async (ctx, next) => {
    if (ctx.callbackQuery && isGroupChat(ctx) && ctx.from) {
      const data = ctx.callbackQuery.data ?? "";
      if (!PUBLIC_CALLBACKS.has(data)) {
        const trip = repo.getTripByGroupId(ctx.chat!.id);
        if (!trip) {
          await ctx.answerCallbackQuery({
            text: "No trip yet. Tap Start Trip first.",
            show_alert: true,
          });
          return;
        }
        const participant = repo.getParticipant(trip.id, ctx.from.id);
        if (!participant?.active) {
          await ctx.answerCallbackQuery({
            text: "You're not a participant in this trip.",
            show_alert: true,
          });
          return;
        }
        ctx.trip = trip;
        ctx.participant = participant;
      }
      await next();
      return;
    }

    if (!isGroupChat(ctx) || !ctx.from) {
      await next();
      return;
    }

    const label = menuLabel(ctx);

    if (label && PUBLIC_MENU_LABELS.has(label)) {
      await next();
      return;
    }

    const WIZARD_STEPS = new Set([
      "awaiting_add_member",
      "expense_amount",
      "expense_custom_amounts",
      "expense_custom_percent",
      "settle_amount",
    ]);

    if (!label) {
      if (WIZARD_STEPS.has(ctx.session.step)) {
        const groupId = ctx.chat!.id;
        const trip = repo.getTripByGroupId(groupId);
        const participant = trip
          ? repo.getParticipant(trip.id, ctx.from.id)
          : undefined;
        if (trip && participant?.active) {
          ctx.trip = trip;
          ctx.participant = participant;
        }
      }
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