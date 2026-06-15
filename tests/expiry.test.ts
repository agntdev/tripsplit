/**
 * F09 — settlement expiry sweep (telegram-test-advanced programmatic).
 */
import { describe, expect, it } from "vitest";
import { runExpirySweepOnce } from "../src/jobs/settlementExpiry";
import { makeBot } from "../src/index";
import { createRepository } from "../src/storage/repository";
import { captureCalls, GROUP_ID } from "./helpers";

process.env.HARNESS = "1";
process.env.BOT_TOKEN = "0:TEST";

describe("settlement expiry sweep", () => {
  it("expires stale pending settlements and notifies the group", async () => {
    const repo = createRepository();
    const trip = repo.createTrip({
      telegramGroupId: GROUP_ID,
      organizerUserId: 1001,
      organizerDisplayName: "@alice",
    });
    repo.upsertParticipant(trip.id, 1002, "@bob");

    repo.createSettlement({
      tripId: trip.id,
      payerUserId: 1002,
      payeeUserId: 1001,
      amountCents: 1000,
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const bot = makeBot(repo);
    const calls = captureCalls(bot);

    await runExpirySweepOnce(bot, repo, "2026-01-01T00:00:00.000Z");

    const settlement = repo.listSettlements(trip.id)[0];
    expect(settlement?.status).toBe("expired");

    const notice = calls.find(
      (c) =>
        c.method === "sendMessage" &&
        c.payload.chat_id === GROUP_ID &&
        typeof c.payload.text === "string" &&
        c.payload.text.includes("Settlement expired"),
    );
    expect(notice).toBeDefined();
  });
});