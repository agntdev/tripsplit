import type { Ctx } from "../context";
import {
  computeBalances,
  formatBalanceLine,
} from "../services/ledger";
import type { Repository } from "../storage/repository";
import { balancesInlineKeyboard } from "../ui/keyboards";

export async function showBalances(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip) return;

  const members = repo.listActiveParticipants(ctx.trip.id);
  const balances = computeBalances(ctx.trip.id, repo);

  const lines = members.map((m) => {
    const cents = balances.get(m.telegramUserId) ?? 0;
    return formatBalanceLine(m.displayName, cents);
  });

  const body =
    lines.length > 0
      ? ["Balances (USD):", ...lines].join("\n")
      : "Balances (USD):\n(no participants)";

  await ctx.reply(body, { reply_markup: balancesInlineKeyboard() });
}