import { inlineButton, inlineKeyboard } from "@agntdev/bot-toolkit";
import { CB_PREFIX } from "../config";
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