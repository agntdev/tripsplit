import { inlineButton, inlineKeyboard } from "@agntdev/bot-toolkit";
import { CB_PREFIX } from "../config";
import type { Participant } from "../types";

export function payerKeyboard(members: Participant[]) {
  const rows = members.map((m) => [
    inlineButton(m.displayName, `${CB_PREFIX}expense:payer:${m.telegramUserId}`),
  ]);
  rows.push([inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)]);
  return inlineKeyboard(rows);
}

export function participantsKeyboard() {
  return inlineKeyboard([
    [
      inlineButton("Everyone", `${CB_PREFIX}expense:everyone`),
      inlineButton("Pick people…", `${CB_PREFIX}expense:pick`),
    ],
    [inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)],
  ]);
}

export function pickPeopleKeyboard(
  members: Participant[],
  selected: Set<number>,
) {
  const rows = members.map((m) => {
    const mark = selected.has(m.telegramUserId) ? "☑" : "☐";
    return [
      inlineButton(
        `${mark} ${m.displayName}`,
        `${CB_PREFIX}expense:toggle:${m.telegramUserId}`,
      ),
    ];
  });
  rows.push([
    inlineButton("Done", `${CB_PREFIX}expense:pick:done`),
    inlineButton("Cancel", `${CB_PREFIX}expense:cancel`),
  ]);
  return inlineKeyboard(rows);
}

export function splitTypeKeyboard() {
  return inlineKeyboard([
    [
      inlineButton("Even", `${CB_PREFIX}expense:split:even`),
      inlineButton("Custom amounts", `${CB_PREFIX}expense:split:cents`),
    ],
    [
      inlineButton("Custom %", `${CB_PREFIX}expense:split:pct`),
      inlineButton("Cancel", `${CB_PREFIX}expense:cancel`),
    ],
  ]);
}

export function confirmExpenseKeyboard() {
  return inlineKeyboard([
    [
      inlineButton("Post expense", `${CB_PREFIX}expense:post`),
      inlineButton("Back", `${CB_PREFIX}expense:back`),
    ],
    [inlineButton("Cancel", `${CB_PREFIX}expense:cancel`)],
  ]);
}