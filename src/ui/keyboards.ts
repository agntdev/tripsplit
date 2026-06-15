import { inlineButton, inlineKeyboard } from "@agntdev/bot-toolkit";
import { CB_PREFIX } from "../config";
import type { Participant } from "../types";
import { MENU } from "./labels";

/** Persistent reply keyboard shown after a trip is active. */
export function mainMenuReplyKeyboard() {
  return {
    keyboard: [
      [{ text: MENU.LOG_EXPENSE }, { text: MENU.BALANCES }],
      [{ text: MENU.SUGGESTED }, { text: MENU.SETTLE }],
      [{ text: MENU.MEMBERS }, { text: MENU.EXPORT }],
      [{ text: MENU.HELP }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** Pre-trip keyboard: start + help only. */
export function preTripReplyKeyboard() {
  return {
    keyboard: [[{ text: MENU.START_TRIP }, { text: MENU.HELP }]],
    resize_keyboard: true,
  };
}

/** Inline start button (e.g. pinned welcome message). */
export function startTripInlineKeyboard() {
  return inlineKeyboard([
    [inlineButton(MENU.START_TRIP, `${CB_PREFIX}menu:start`)],
    [inlineButton(MENU.HELP, `${CB_PREFIX}menu:help`)],
  ]);
}

/** Inline navigation under balance / suggested screens. */
export function balancesInlineKeyboard() {
  return inlineKeyboard([
    [
      inlineButton(MENU.SUGGESTED, `${CB_PREFIX}menu:suggested`),
      inlineButton(MENU.LOG_EXPENSE, `${CB_PREFIX}menu:expense`),
    ],
  ]);
}

/** Members management inline menu. */
export function membersMenuKeyboard() {
  return inlineKeyboard([
    [inlineButton("➕ Add Member", `${CB_PREFIX}members:add`)],
    [inlineButton("➖ Remove Member", `${CB_PREFIX}members:remove`)],
    [inlineButton("📋 List Members", `${CB_PREFIX}members:list`)],
  ]);
}

/** Pick a participant to remove. */
export function removeMemberKeyboard(members: Participant[]) {
  const rows = members.map((m) => [
    inlineButton(`❌ ${m.displayName}`, `${CB_PREFIX}members:rm:${m.telegramUserId}`),
  ]);
  rows.push([inlineButton("« Back", `${CB_PREFIX}members:back`)]);
  return inlineKeyboard(rows);
}

/** Pick a payee for settlement (excludes the payer). */
export function settlePickPayeeKeyboard(
  members: Participant[],
  payerUserId: number,
) {
  const rows = members
    .filter((m) => m.telegramUserId !== payerUserId)
    .map((m) => [
      inlineButton(m.displayName, `${CB_PREFIX}settle:pick:${m.telegramUserId}`),
    ]);
  rows.push([inlineButton("Cancel", `${CB_PREFIX}settle:cancel`)]);
  return inlineKeyboard(rows);
}

/** Payer confirmation keyboard for a pending settlement. */
export function settlePayerKeyboard(settlementId: number) {
  return inlineKeyboard([
    [inlineButton("I paid", `${CB_PREFIX}settle:paid:${settlementId}`)],
    [inlineButton("Cancel", `${CB_PREFIX}settle:cancel:${settlementId}`)],
  ]);
}

/** Payee DM confirmation keyboard. */
export function settlePayeeConfirmKeyboard(settlementId: number) {
  return inlineKeyboard([
    [
      inlineButton("Confirm receipt", `${CB_PREFIX}settle:confirm:${settlementId}`),
      inlineButton("Dispute", `${CB_PREFIX}settle:dispute:${settlementId}`),
    ],
  ]);
}