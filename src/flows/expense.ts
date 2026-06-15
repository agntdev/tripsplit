/**
 * Expense wizard — inline buttons + text capture for amounts/percents.
 */
import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import {
  applyEvenSplit,
  cancelExpense,
  postExpense,
  promptCustomAmount,
  promptCustomPercent,
  promptExpenseAmount,
  showConfirmStep,
  showParticipantsStep,
  showPickPeopleStep,
  showSplitTypeStep,
  startExpenseWithAmount,
} from "../actions/expense";
import {
  finalizeCustomCents,
  splitCustomPercent,
} from "../services/split";
import type { Repository } from "../storage/repository";
import { formatCents, parseAmount } from "../utils/amount";
import { parseExpenseInput } from "../utils/expenseInput";

const EXPENSE_STEPS = new Set([
  "expense_amount",
  "expense_custom_amounts",
  "expense_custom_percent",
]);

export function registerExpenseFlow(bot: Bot<Ctx>, repo: Repository): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}expense:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();
    if (!ctx.trip || !ctx.from) return;

    if (data === `${CB_PREFIX}expense:cancel`) {
      cancelExpense(ctx);
      await ctx.reply("Cancelled.");
      return;
    }

    const draft = ctx.session.draft;
    if (!draft && data !== `${CB_PREFIX}expense:cancel`) {
      return;
    }

    const payerMatch = data.match(
      new RegExp(`^${CB_PREFIX}expense:payer:(\\d+)$`),
    );
    if (payerMatch) {
      draft!.payerUserId = Number(payerMatch[1]);
      await showParticipantsStep(ctx);
      return;
    }

    if (data === `${CB_PREFIX}expense:everyone`) {
      draft!.participantUserIds = repo
        .listActiveParticipants(ctx.trip.id)
        .map((m) => m.telegramUserId);
      await showSplitTypeStep(ctx);
      return;
    }

    if (data === `${CB_PREFIX}expense:pick`) {
      draft!.participantUserIds = [];
      await showPickPeopleStep(ctx, repo);
      return;
    }

    const toggleMatch = data.match(
      new RegExp(`^${CB_PREFIX}expense:toggle:(\\d+)$`),
    );
    if (toggleMatch) {
      const uid = Number(toggleMatch[1]);
      const idx = draft!.participantUserIds.indexOf(uid);
      if (idx >= 0) draft!.participantUserIds.splice(idx, 1);
      else draft!.participantUserIds.push(uid);
      await showPickPeopleStep(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}expense:pick:done`) {
      if (draft!.participantUserIds.length === 0) {
        await ctx.reply("Select at least one person.");
        return;
      }
      await showSplitTypeStep(ctx);
      return;
    }

    if (data === `${CB_PREFIX}expense:split:even`) {
      await applyEvenSplit(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}expense:split:cents`) {
      draft!.splitMode = "cents";
      draft!.shares = [];
      draft!.customCursor = 0;
      ctx.session.step = "expense_custom_amounts";
      await promptCustomAmount(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}expense:split:pct`) {
      draft!.splitMode = "percent";
      draft!.percentByUser = {};
      draft!.customCursor = 0;
      ctx.session.step = "expense_custom_percent";
      await promptCustomPercent(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}expense:post`) {
      await postExpense(ctx, repo);
      return;
    }

    if (data === `${CB_PREFIX}expense:back`) {
      await showSplitTypeStep(ctx);
      return;
    }
  });

  bot.on("message:text", async (ctx, next) => {
    if (!EXPENSE_STEPS.has(ctx.session.step) || !ctx.trip) {
      await next();
      return;
    }

    const text = ctx.message.text.trim();

    if (ctx.session.step === "expense_amount") {
      const parsed = parseExpenseInput(text);
      if (!parsed) {
        await ctx.reply(
          "Couldn't parse amount. Example: 48.50 dinner",
        );
        return;
      }
      await startExpenseWithAmount(
        ctx,
        repo,
        parsed.amountCents,
        parsed.description,
      );
      return;
    }

    const draft = ctx.session.draft;
    if (!draft?.payerUserId) {
      await next();
      return;
    }

    if (ctx.session.step === "expense_custom_amounts") {
      const cents = parseAmount(text);
      if (cents === null || cents < 0) {
        await ctx.reply("Enter a valid amount (e.g. 16.50).");
        return;
      }
      const userId = draft.participantUserIds[draft.customCursor];
      draft.shares.push({ userId, shareCents: cents });
      draft.customCursor += 1;
      if (draft.customCursor < draft.participantUserIds.length) {
        await promptCustomAmount(ctx, repo);
        return;
      }
      const result = finalizeCustomCents(
        draft.amountCents,
        draft.shares,
        draft.payerUserId,
        draft.participantUserIds,
      );
      if (!result.ok) {
        draft.shares = [];
        draft.customCursor = 0;
        await ctx.reply(
          `Shares must total ${formatCents(draft.amountCents)}. You're ${formatCents(result.gapCents)} over — adjust or use Even.`,
        );
        await promptCustomAmount(ctx, repo);
        return;
      }
      await showConfirmStep(ctx, repo, result.shares);
      return;
    }

    if (ctx.session.step === "expense_custom_percent") {
      const pct = Number(text.replace("%", "").trim());
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        await ctx.reply("Enter a percent between 0 and 100.");
        return;
      }
      const userId = draft.participantUserIds[draft.customCursor];
      draft.percentByUser[userId] = pct;
      draft.customCursor += 1;
      if (draft.customCursor < draft.participantUserIds.length) {
        await promptCustomPercent(ctx, repo);
        return;
      }
      const percents = draft.participantUserIds.map((uid) => ({
        userId: uid,
        percent: draft.percentByUser[uid] ?? 0,
      }));
      const shares = splitCustomPercent(
        draft.amountCents,
        percents,
        draft.payerUserId,
        draft.participantUserIds,
      );
      const total = shares.reduce((s, x) => s + x.shareCents, 0);
      if (total !== draft.amountCents) {
        await showConfirmStep(ctx, repo, shares);
        return;
      }
      await showConfirmStep(ctx, repo, shares);
    }
  });
}