import { inlineButton, inlineKeyboard } from "@agntdev/bot-toolkit";
import { CB_PREFIX } from "../config";
import type { Participant } from "../types";

export function settlePayeeKeyboard(
  members: Participant[],
  payerUserId: number,
) {
  const rows = members
    .filter((m) => m.telegramUserId !== payerUserId)
    .map((m) => [
      inlineButton(
        m.displayName,
        `${CB_PREFIX}settle:payee:${m.telegramUserId}`,
      ),
    ]);
  rows.push([inlineButton("Cancel", `${CB_PREFIX}settle:cancel_wizard`)]);
  return inlineKeyboard(rows);
}

export function settlementPayerKeyboard(settlementId: number) {
  return inlineKeyboard([
    [
      inlineButton("I paid", `${CB_PREFIX}settle:paid:${settlementId}`),
      inlineButton("Cancel", `${CB_PREFIX}settle:cancel:${settlementId}`),
    ],
  ]);
}

export function settlementPayeeDmKeyboard(settlementId: number) {
  return inlineKeyboard([
    [
      inlineButton(
        "Confirm receipt",
        `${CB_PREFIX}settle:confirm:${settlementId}`,
      ),
      inlineButton("Dispute", `${CB_PREFIX}settle:dispute:${settlementId}`),
    ],
  ]);
}