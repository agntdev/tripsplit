/**
 * Ledger service — unit tests via injected repository (telegram-test-advanced §3).
 */
import { describe, expect, it } from "vitest";
import { computeBalances, getPairBalance } from "../src/services/ledger";
import { createRepository } from "../src/storage/repository";

describe("ledger", () => {
  it("computes pair balance after even expense", () => {
    const repo = createRepository();
    const trip = repo.createTrip({
      telegramGroupId: -1,
      organizerUserId: 1001,
      organizerDisplayName: "@alice",
    });
    repo.upsertParticipant(trip.id, 1002, "@bob");

    repo.createExpense({
      tripId: trip.id,
      payerUserId: 1001,
      amountCents: 2000,
      description: "lunch",
      shares: [
        { participantUserId: 1001, shareCents: 1000 },
        { participantUserId: 1002, shareCents: 1000 },
      ],
    });

    expect(getPairBalance(trip.id, 1002, 1001, repo)).toBe(1000);

    const balances = computeBalances(trip.id, repo);
    expect(balances.get(1001)).toBe(1000);
    expect(balances.get(1002)).toBe(-1000);
  });
});