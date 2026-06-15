import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";
import type { Participant, ExpenseDraft } from "../types";
import { formatCents, parseAmount } from "../utils/amount";
import { displayName } from "../utils/display";
import {
  expenseCancelKeyboard,
  expensePayerKeyboard,
  expenseParticipantsKeyboard,
  expensePickPeopleKeyboard,
  expenseSplitTypeKeyboard,
  expenseConfirmKeyboard,
} from "../ui/keyboards";
import { mainMenuReplyKeyboard } from "../ui/keyboards";

export function emptyDraft(): ExpenseDraft {
  return {
    amountCents: 0,
    description: "",
    payerUserId: null,
    participantUserIds: [],
    splitMode: null,
    shares: [],
  };
}

export function cancelWizard(ctx: Ctx): void {
  ctx.session.step = "idle";
  ctx.session.draft = null;
  ctx.session.customShareIndex = undefined;
}

export function participantLabel(
  participants: Participant[],
  userId: number,
): string {
  const p = participants.find((m) => m.telegramUserId === userId);
  return p ? p.displayName : `user${userId}`;
}

/** Start wizard from button — collect amount first. */
export async function startExpenseWizard(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;
  ctx.session.draft = emptyDraft();
  ctx.session.customShareIndex = undefined;
  ctx.session.step = "expense_amount";
  await ctx.reply("How much was the expense? (e.g. 48.50 or 4850)", {
    reply_markup: expenseCancelKeyboard(),
  });
}

/** Start wizard from /expense <amount> [description]. */
export async function startExpenseFromArgs(
  ctx: Ctx,
  repo: Repository,
  amountStr: string,
  description?: string,
): Promise<void> {
  if (!ctx.trip) return;

  const cents = parseAmount(amountStr);
  if (cents === null || cents <= 0) {
    await ctx.reply(
      "Couldn't parse amount. Example: /expense 12.50 coffee",
    );
    return;
  }

  if (description && description.length > 200) {
    description = description.slice(0, 200);
  }

  ctx.session.draft = {
    ...emptyDraft(),
    amountCents: cents,
    description: description ?? "",
  };
  ctx.session.customShareIndex = undefined;
  ctx.session.step = "expense_payer";

  await ctx.reply(
    `New expense: ${formatCents(cents)}${description ? ` — ${description}` : ""}\nWho paid?`,
    {
      reply_markup: expensePayerKeyboard(
        repo.listActiveParticipants(ctx.trip.id),
        ctx.from!.id,
      ),
    },
  );
}

/** Handle amount text input (button-first wizard). */
export async function handleAmountInput(
  ctx: Ctx,
  repo: Repository,
  text: string,
): Promise<void> {
  if (!ctx.trip || !ctx.from || !ctx.session.draft) return;

  if (text.toLowerCase() === "cancel") {
    cancelWizard(ctx);
    await ctx.reply("Cancelled.", { reply_markup: mainMenuReplyKeyboard() });
    return;
  }

  const cents = parseAmount(text);
  if (cents === null || cents <= 0) {
    await ctx.reply(
      "Please enter a valid amount. (e.g. 48.50 or 4850)\nOr send 'cancel' to abort.",
      { reply_markup: expenseCancelKeyboard() },
    );
    return;
  }

  ctx.session.draft.amountCents = cents;
  ctx.session.step = "expense_description";
  await ctx.reply(
    "Description? (send '-' to skip, or 'cancel' to abort)",
    { reply_markup: expenseCancelKeyboard() },
  );
}

/** Handle description text input. */
export async function handleDescriptionInput(
  ctx: Ctx,
  repo: Repository,
  text: string,
): Promise<void> {
  if (!ctx.trip || !ctx.from || !ctx.session.draft) return;

  if (text.toLowerCase() === "cancel") {
    cancelWizard(ctx);
    await ctx.reply("Cancelled.", { reply_markup: mainMenuReplyKeyboard() });
    return;
  }

  const desc = text === "-" ? "" : text.slice(0, 200);
  ctx.session.draft.description = desc;
  ctx.session.step = "expense_payer";

  const draft = ctx.session.draft;
  await ctx.reply(
    `New expense: ${formatCents(draft.amountCents)}${desc ? ` — ${desc}` : ""}\nWho paid?`,
    {
      reply_markup: expensePayerKeyboard(
        repo.listActiveParticipants(ctx.trip.id),
        ctx.from.id,
      ),
    },
  );
}

/** Select payer. */
export async function selectPayer(
  ctx: Ctx,
  repo: Repository,
  payerUserId: number,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  ctx.session.draft.payerUserId = payerUserId;
  ctx.session.step = "expense_participants";

  await ctx.reply("Split among whom?", {
    reply_markup: expenseParticipantsKeyboard(),
  });
}

/** Select all participants. */
export async function selectAllParticipants(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  const members = repo.listActiveParticipants(ctx.trip.id);
  ctx.session.draft.participantUserIds = members.map((m) => m.telegramUserId);
  ctx.session.step = "expense_split_type";

  await ctx.reply(
    `How to split ${formatCents(ctx.session.draft.amountCents)}?`,
    { reply_markup: expenseSplitTypeKeyboard() },
  );
}

/** Enter pick-people mode. */
export async function enterPickPeople(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  const members = repo.listActiveParticipants(ctx.trip.id);
  ctx.session.step = "expense_pick_people";
  ctx.session.draft.participantUserIds = [];

  await ctx.reply("Tap participants to include:", {
    reply_markup: expensePickPeopleKeyboard(
      members,
      ctx.session.draft.participantUserIds,
    ),
  });
}

/** Toggle a participant in the pick-people list. */
export async function togglePickPerson(
  ctx: Ctx,
  repo: Repository,
  userId: number,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft || !ctx.from) return;

  const ids = ctx.session.draft.participantUserIds;
  const idx = ids.indexOf(userId);
  if (idx >= 0) {
    ids.splice(idx, 1);
  } else {
    ids.push(userId);
  }

  const members = repo.listActiveParticipants(ctx.trip.id);
  await (ctx.callbackQuery?.message
    ? ctx.api.editMessageReplyMarkup(
        ctx.chat!.id,
        ctx.callbackQuery.message.message_id,
        { reply_markup: expensePickPeopleKeyboard(members, ids) },
      )
    : Promise.resolve());

  await ctx.answerCallbackQuery();
}

/** Finish picking people — require at least one. */
export async function finishPickPeople(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  if (ctx.session.draft.participantUserIds.length === 0) {
    await ctx.answerCallbackQuery?.({
      text: "Select at least one person.",
      show_alert: true,
    });
    return;
  }

  await ctx.answerCallbackQuery();
  ctx.session.step = "expense_split_type";
  await ctx.reply(
    `How to split ${formatCents(ctx.session.draft.amountCents)}?`,
    { reply_markup: expenseSplitTypeKeyboard() },
  );
}

/** Compute even split and go to confirm. */
export async function selectEvenSplit(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  const draft = ctx.session.draft;
  draft.splitMode = "even";
  draft.shares = computeEvenSplit(draft);
  ctx.session.step = "expense_confirm";

  const members = repo.listActiveParticipants(ctx.trip.id);
  await ctx.reply(confirmMessage(draft, members), {
    reply_markup: expenseConfirmKeyboard(),
  });
}

/** Enter custom cents mode. */
export async function enterCustomCents(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  const draft = ctx.session.draft;
  draft.splitMode = "cents";
  draft.shares = [];
  ctx.session.customShareIndex = 0;
  ctx.session.step = "expense_custom_amounts";

  await promptCustomShare(ctx, repo);
}

/** Enter custom percent mode. */
export async function enterCustomPercent(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  const draft = ctx.session.draft;
  draft.splitMode = "percent";
  draft.shares = [];
  ctx.session.customShareIndex = 0;
  ctx.session.step = "expense_custom_percent";

  await promptCustomPercent(ctx, repo);
}

async function promptCustomShare(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;
  const draft = ctx.session.draft;
  const members = repo.listActiveParticipants(ctx.trip.id);
  const idx = ctx.session.customShareIndex ?? 0;
  const ids = draft.participantUserIds;

  if (idx >= ids.length) {
    const sum = draft.shares.reduce((s, sh) => s + sh.shareCents, 0);
    if (sum !== draft.amountCents) {
      const diff = draft.amountCents - sum;
      if (draft.payerUserId !== null) {
        const payerShare = draft.shares.find(
          (s) => s.userId === draft.payerUserId,
        );
        if (payerShare) {
          payerShare.shareCents += diff;
        } else {
          draft.shares.push({ userId: draft.payerUserId, shareCents: diff });
        }
      }
    }
    if (draft.shares.some((s) => s.shareCents < 0)) {
      await ctx.reply(
        `Shares exceed the total ${formatCents(draft.amountCents)}. Please adjust.`,
        { reply_markup: expenseCancelKeyboard() },
      );
      draft.shares = [];
      ctx.session.customShareIndex = 0;
      return;
    }
    ctx.session.step = "expense_confirm";
    await ctx.reply(confirmMessage(draft, members), {
      reply_markup: expenseConfirmKeyboard(),
    });
    return;
  }

  const collected = draft.shares.reduce((s, sh) => s + sh.shareCents, 0);
  const remaining = draft.amountCents - collected;
  const label = participantLabel(members, ids[idx]);
  await ctx.reply(
    `How much for ${label}? (e.g. 16.50)\nRemaining: ${formatCents(remaining)}\nOr send 'cancel' to abort.`,
    { reply_markup: expenseCancelKeyboard() },
  );
}

async function promptCustomPercent(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;
  const draft = ctx.session.draft;
  const members = repo.listActiveParticipants(ctx.trip.id);
  const idx = ctx.session.customShareIndex ?? 0;
  const ids = draft.participantUserIds;

  if (idx >= ids.length) {
    const totalPct = draft.shares.reduce(
      (s, sh) => s + sh.shareCents / 100,
      0,
    );
    if (totalPct > 100) {
      await ctx.reply(
        `Percentages total ${totalPct.toFixed(1)}% — must not exceed 100%. Please adjust.`,
        { reply_markup: expenseCancelKeyboard() },
      );
      draft.shares = [];
      ctx.session.customShareIndex = 0;
      return;
    }
    convertPercentagesToCents(draft);
    ctx.session.step = "expense_confirm";
    await ctx.reply(confirmMessage(draft, members), {
      reply_markup: expenseConfirmKeyboard(),
    });
    return;
  }

  const collected = draft.shares.reduce(
    (s, sh) => s + sh.shareCents / 100,
    0,
  );
  const label = participantLabel(members, ids[idx]);
  await ctx.reply(
    `Percent for ${label}? (e.g. 33)\nCollected so far: ${collected.toFixed(1)}%\nOr send 'cancel' to abort.`,
    { reply_markup: expenseCancelKeyboard() },
  );
}

/** Handle custom cents text input. */
export async function handleCustomCentsInput(
  ctx: Ctx,
  repo: Repository,
  text: string,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  if (text.toLowerCase() === "cancel") {
    cancelWizard(ctx);
    await ctx.reply("Cancelled.", { reply_markup: mainMenuReplyKeyboard() });
    return;
  }

  const cents = parseAmount(text);
  if (cents === null || cents < 0) {
    await ctx.reply(
      "Please enter a valid amount. (e.g. 16.50)\nOr send 'cancel' to abort.",
      { reply_markup: expenseCancelKeyboard() },
    );
    return;
  }

  const idx = ctx.session.customShareIndex ?? 0;
  const userId = ctx.session.draft.participantUserIds[idx];
  ctx.session.draft.shares.push({ userId, shareCents: cents });
  ctx.session.customShareIndex = idx + 1;
  await promptCustomShare(ctx, repo);
}

/** Handle custom percent text input. */
export async function handleCustomPercentInput(
  ctx: Ctx,
  repo: Repository,
  text: string,
): Promise<void> {
  if (!ctx.trip || !ctx.session.draft) return;

  if (text.toLowerCase() === "cancel") {
    cancelWizard(ctx);
    await ctx.reply("Cancelled.", { reply_markup: mainMenuReplyKeyboard() });
    return;
  }

  const pct = Number(text.trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
    await ctx.reply(
      "Please enter a percent between 0 and 100.\nOr send 'cancel' to abort.",
      { reply_markup: expenseCancelKeyboard() },
    );
    return;
  }

  const idx = ctx.session.customShareIndex ?? 0;
  const userId = ctx.session.draft.participantUserIds[idx];
  ctx.session.draft.shares.push({ userId, shareCents: Math.round(pct * 100) });
  ctx.session.customShareIndex = idx + 1;
  await promptCustomPercent(ctx, repo);
}

function convertPercentagesToCents(draft: ExpenseDraft): void {
  const totalCents = draft.amountCents;
  const scale = 100;
  let totalShareCents = 0;

  for (const share of draft.shares) {
    const pct = share.shareCents / (100 * scale);
    const cents = Math.floor(totalCents * pct);
    share.shareCents = cents;
    totalShareCents += cents;
  }

  const remainder = totalCents - totalShareCents;
  if (remainder > 0 && draft.payerUserId !== null) {
    const payerShare = draft.shares.find(
      (s) => s.userId === draft.payerUserId,
    );
    if (payerShare) {
      payerShare.shareCents += remainder;
    }
  }
}

function computeEvenSplit(draft: ExpenseDraft): {
  userId: number;
  shareCents: number;
}[] {
  const n = draft.participantUserIds.length;
  if (n === 0) return [];

  const base = Math.floor(draft.amountCents / n);
  const remainder = draft.amountCents - base * n;

  return draft.participantUserIds.map((userId) => ({
    userId,
    shareCents: userId === draft.payerUserId ? base + remainder : base,
  }));
}

export function confirmMessage(
  draft: ExpenseDraft,
  members: Participant[],
): string {
  const payerLabel = draft.payerUserId
    ? participantLabel(members, draft.payerUserId)
    : "?";

  const shares = draft.shares.map((s) => {
    const label = participantLabel(members, s.userId);
    return `${label} ${formatCents(s.shareCents)}`;
  });

  const splitDesc =
    draft.splitMode === "even"
      ? `even among ${draft.participantUserIds.length}`
      : draft.splitMode === "cents"
        ? "custom amounts"
        : "custom percent";

  return [
    "Confirm expense:",
    `Payer: ${payerLabel}`,
    `Split: ${splitDesc} → ${shares.join(", ")}`,
    draft.description ? `Description: ${draft.description}` : "",
  ].join("\n");
}
