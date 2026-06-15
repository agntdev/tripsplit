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

/** Cancel button for text-input wizard steps. */
export function expenseCancelKeyboard() {
  return inlineKeyboard([
    [inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)],
  ]);
}

/** Payer picker — one button per active participant. */
export function expensePayerKeyboard(
  participants: Participant[],
  fromUserId: number,
) {
  const rows = participants.map((p) => {
    const label = p.telegramUserId === fromUserId
      ? `You (${p.displayName})`
      : p.displayName;
    return [
      inlineButton(label, `${CB_PREFIX}expense:payer:${p.telegramUserId}`),
    ];
  });
  rows.push([inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)]);
  return inlineKeyboard(rows);
}

/** Split among whom — everyone or pick specific. */
export function expenseParticipantsKeyboard() {
  return inlineKeyboard([
    [inlineButton("Everyone", `${CB_PREFIX}expense:everyone`)],
    [inlineButton("Pick people…", `${CB_PREFIX}expense:pick`)],
    [inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)],
  ]);
}

/** Toggleable participant picker. */
export function expensePickPeopleKeyboard(
  participants: Participant[],
  selectedIds: number[],
) {
  const rows = participants.map((p) => {
    const checked = selectedIds.includes(p.telegramUserId);
    return [
      inlineButton(
        `${checked ? "☑" : "☐"} ${p.displayName}`,
        `${CB_PREFIX}expense:toggle:${p.telegramUserId}`,
      ),
    ];
  });
  rows.push([
    inlineButton(
      selectedIds.length > 0 ? `Done (${selectedIds.length})` : "Done",
      `${CB_PREFIX}expense:pick:done`,
    ),
  ]);
  rows.push([inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)]);
  return inlineKeyboard(rows);
}

/** Split type selector. */
export function expenseSplitTypeKeyboard() {
  return inlineKeyboard([
    [inlineButton("Even", `${CB_PREFIX}expense:split:even`)],
    [
      inlineButton("Custom amounts", `${CB_PREFIX}expense:split:cents`),
      inlineButton("Custom %", `${CB_PREFIX}expense:split:pct`),
    ],
    [inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)],
  ]);
}

/** Confirm / post / back / cancel. */
export function expenseConfirmKeyboard() {
  return inlineKeyboard([
    [inlineButton("✅ Post expense", `${CB_PREFIX}expense:post`)],
    [
      inlineButton("« Back", `${CB_PREFIX}expense:back`),
      inlineButton("Cancel", `${CB_PREFIX}expense:cancel`),
    ],
  ]);
}