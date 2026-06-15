import type { Ctx } from "../context";
import { computeBalances } from "../services/ledger";
import { greedyPairing } from "../services/simplify";
import type { Repository } from "../storage/repository";
import type { SuggestedPayment } from "../types";
import { suggestedKeyboard } from "../ui/keyboards";
import { formatCents } from "../utils/amount";

function memberName(
  repo: Repository,
  tripId: number,
  userId: number,
): string {
  return repo.getParticipant(tripId, userId)?.displayName ?? `user${userId}`;
}

export async function showSuggested(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip) return;

  const balances = computeBalances(ctx.trip.id, repo);
  const allZero = [...balances.values()].every((v) => v === 0);
  if (allZero || balances.size === 0) {
    ctx.session.suggestedPayments = [];
    await ctx.reply("Everyone is settled up! 🎉");
    return;
  }

  const payments = greedyPairing(balances);
  ctx.session.suggestedPayments = payments;

  if (payments.length === 0) {
    await ctx.reply("Everyone is settled up! 🎉");
    return;
  }

  const lines = payments.map((p, i) => {
    const payer = memberName(repo, ctx.trip!.id, p.payerUserId);
    const payee = memberName(repo, ctx.trip!.id, p.payeeUserId);
    return `${i + 1}. ${payer} pays ${payee} ${formatCents(p.amountCents)}`;
  });

  await ctx.reply(
    ["Suggested payments:", ...lines].join("\n"),
    { reply_markup: suggestedKeyboard(payments.length) },
  );
}

export function getSuggestedPayment(
  ctx: Ctx,
  index: number,
): SuggestedPayment | undefined {
  return ctx.session.suggestedPayments[index];
}