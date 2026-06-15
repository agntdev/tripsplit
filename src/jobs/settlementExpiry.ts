import type { Bot } from "grammy";
import type { Ctx } from "../context";
import type { Repository } from "../storage/repository";
import { formatCents } from "../utils/amount";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

function memberName(
  repo: Repository,
  tripId: number,
  userId: number,
): string {
  return repo.getParticipant(tripId, userId)?.displayName ?? `user${userId}`;
}

/** Single expiry pass — exported for programmatic tests. */
export async function runExpirySweepOnce(
  bot: Bot<Ctx>,
  repo: Repository,
  nowIso = new Date().toISOString(),
): Promise<void> {
  const stale = repo.listExpiredPendingSettlements(nowIso);

  for (const settlement of stale) {
    repo.updateSettlement(settlement.id, { status: "expired" });
    const trip = repo.getTripById(settlement.tripId);
    if (!trip) continue;

    const payer = memberName(
      repo,
      settlement.tripId,
      settlement.payerUserId,
    );
    const payee = memberName(
      repo,
      settlement.tripId,
      settlement.payeeUserId,
    );

    try {
      await bot.api.sendMessage(
        trip.telegramGroupId,
        [
          `⏱ Settlement expired: ${payer} → ${payee} ${formatCents(settlement.amountCents)} was not confirmed in 7 days.`,
          "Start again with ✅ Settle if still needed.",
        ].join("\n"),
      );
    } catch {
      // Group may be unreachable in harness edge cases.
    }
  }
}

export function startSettlementExpirySweep(
  bot: Bot<Ctx>,
  repo: Repository,
): void {
  if (process.env.HARNESS === "1") return;

  void runExpirySweepOnce(bot, repo);
  setInterval(() => void runExpirySweepOnce(bot, repo), SWEEP_INTERVAL_MS);
}