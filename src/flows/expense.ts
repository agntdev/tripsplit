import type { Bot } from "grammy";
import { CB_PREFIX } from "../config";
import type { Ctx } from "../context";
import {
  cancelWizard,
  enterCustomCents,
  enterCustomPercent,
  enterPickPeople,
  finishPickPeople,
  handleAmountInput,
  handleCustomCentsInput,
  handleCustomPercentInput,
  handleDescriptionInput,
  participantLabel,
  selectAllParticipants,
  selectEvenSplit,
  selectPayer,
  togglePickPerson,
} from "../actions/expense";
import type { Repository } from "../storage/repository";
import {
  expenseParticipantsKeyboard,
  expensePayerKeyboard,
  expenseSplitTypeKeyboard,
  mainMenuReplyKeyboard,
} from "../ui/keyboards";
import { formatCents } from "../utils/amount";

const E = `${CB_PREFIX}expense:`;

export function registerExpenseFlow(bot: Bot<Ctx>, repo: Repository): void {
  bot.callbackQuery(new RegExp(`^${CB_PREFIX}expense:`), async (ctx) => {
    const data = ctx.callbackQuery.data;
    if (!ctx.trip || !ctx.from || !ctx.session.draft) return;

    if (data === `${E}cancel`) {
      cancelWizard(ctx);
      await ctx.answerCallbackQuery();
      await ctx.reply("Cancelled.", {
        reply_markup: mainMenuReplyKeyboard(),
      });
      return;
    }

    const payerMatch = data.match(
      new RegExp(`^${CB_PREFIX}expense:payer:(\\d+)$`),
    );
    if (payerMatch) {
      await selectPayer(ctx, repo, Number(payerMatch[1]));
      return;
    }

    if (data === `${E}everyone`) {
      await selectAllParticipants(ctx, repo);
      return;
    }

    if (data === `${E}pick`) {
      await enterPickPeople(ctx, repo);
      return;
    }

    const toggleMatch = data.match(
      new RegExp(`^${CB_PREFIX}expense:toggle:(\\d+)$`),
    );
    if (toggleMatch) {
      await togglePickPerson(ctx, repo, Number(toggleMatch[1]));
      return;
    }

    if (data === `${E}pick:done`) {
      await finishPickPeople(ctx, repo);
      return;
    }

    if (data === `${E}split:even`) {
      await selectEvenSplit(ctx, repo);
      return;
    }

    if (data === `${E}split:cents`) {
      await enterCustomCents(ctx, repo);
      return;
    }

    if (data === `${E}split:pct`) {
      await enterCustomPercent(ctx, repo);
      return;
    }

    if (data === `${E}post`) {
      await postExpense(ctx, repo);
      return;
    }

    if (data === `${E}back`) {
      await goBack(ctx, repo);
      return;
    }
  });

  bot.on("message:text", async (ctx, next) => {
    const step = ctx.session.step;
    const text = ctx.message?.text;
    if (!text || !ctx.trip || !ctx.from) {
      await next();
      return;
    }

    switch (step) {
      case "expense_amount":
        await handleAmountInput(ctx, repo, text);
        return;
      case "expense_description":
        await handleDescriptionInput(ctx, repo, text);
        return;
      case "expense_custom_amounts":
        await handleCustomCentsInput(ctx, repo, text);
        return;
      case "expense_custom_percent":
        await handleCustomPercentInput(ctx, repo, text);
        return;
    }

    await next();
  });
}

async function postExpense(ctx: Ctx, repo: Repository): Promise<void> {
  if (!ctx.trip || !ctx.from || !ctx.session.draft) return;

  const draft = ctx.session.draft;
  if (draft.payerUserId === null || draft.participantUserIds.length === 0) {
    await ctx.answerCallbackQuery({
      text: "Incomplete expense.",
      show_alert: true,
    });
    return;
  }

  const result = repo.createExpense({
    tripId: ctx.trip.id,
    payerUserId: draft.payerUserId,
    amountCents: draft.amountCents,
    description: draft.description,
    shares: draft.shares.map((s) => ({
      participantUserId: s.userId,
      shareCents: s.shareCents,
    })),
  });

  repo.appendAuditLog(ctx.trip.id, ctx.from.id, "expense_created", {
    expense_id: result.expense.id,
  });

  cancelWizard(ctx);
  await ctx.answerCallbackQuery();

  const payerLabel = participantLabel(
    repo.listActiveParticipants(ctx.trip.id),
    draft.payerUserId,
  );
  await ctx.reply(
    `✅ Logged: ${payerLabel} paid ${formatCents(draft.amountCents)}${draft.description ? ` for ${draft.description}` : ""}`,
    { reply_markup: mainMenuReplyKeyboard() },
  );
}

async function goBack(ctx: Ctx, repo: Repository): Promise<void> {
  if (!ctx.trip || !ctx.session.draft || !ctx.from) return;

  const step = ctx.session.step;
  if (step === "expense_split_type") {
    ctx.session.step = "expense_participants";
    await ctx.answerCallbackQuery();
    await ctx.reply("Split among whom?", {
      reply_markup: expenseParticipantsKeyboard(),
    });
    return;
  }
  if (step === "expense_participants") {
    ctx.session.step = "expense_payer";
    await ctx.answerCallbackQuery();
    await ctx.reply("Who paid?", {
      reply_markup: expensePayerKeyboard(
        repo.listActiveParticipants(ctx.trip.id),
        ctx.from.id,
      ),
    });
    return;
  }
  if (step === "expense_confirm") {
    ctx.session.step = "expense_split_type";
    ctx.session.draft.splitMode = null;
    ctx.session.draft.shares = [];
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `How to split ${formatCents(ctx.session.draft.amountCents)}?`,
      {
        reply_markup: expenseSplitTypeKeyboard(),
      },
    );
    return;
  }
  await ctx.answerCallbackQuery();
}
