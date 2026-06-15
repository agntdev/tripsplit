/**
 * Settle flow — telegram-test-advanced programmatic tests.
 * Exact call assertions the JSON gate cannot express (DM + group cross-chat).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { makeBot } from "../src/index";
import {
  ALICE_ID,
  BOB_ID,
  addBob,
  captureCalls,
  groupCallbackUpdate,
  groupTextUpdate,
  handle,
  initTrip,
  logEvenExpense,
  privateCallbackUpdate,
  resetSeq,
} from "./helpers";

process.env.HARNESS = "1";
process.env.BOT_TOKEN = "0:TEST";

describe("settle dual-confirm flow", () => {
  beforeEach(() => resetSeq());

  it("clears settlement after payer and payee confirm", async () => {
    const bot = makeBot();
    const calls = captureCalls(bot);

    await initTrip(bot);
    await addBob(bot);
    await logEvenExpense(bot, "20.00 lunch", ALICE_ID);

    await handle(bot, groupTextUpdate("💸 Suggested"));
    await handle(
      bot,
      groupCallbackUpdate("ts:suggested:settle:0", {
        userId: BOB_ID,
        name: "Bob",
        username: "bob",
      }),
    );

    const started = calls.find(
      (c) =>
        c.method === "sendMessage" &&
        typeof c.payload.text === "string" &&
        c.payload.text.includes("Settlement started"),
    );
    expect(started).toBeDefined();

    await handle(
      bot,
      groupCallbackUpdate("ts:settle:paid:1", {
        userId: BOB_ID,
        name: "Bob",
        username: "bob",
      }),
    );

    const dm = calls.find(
      (c) =>
        c.method === "sendMessage" &&
        c.payload.chat_id === ALICE_ID &&
        typeof c.payload.text === "string" &&
        c.payload.text.includes("paid you"),
    );
    expect(dm).toBeDefined();

    const beforeConfirm = calls.length;
    await handle(
      bot,
      privateCallbackUpdate("ts:settle:confirm:1", ALICE_ID, "Alice"),
    );

    const cleared = calls
      .slice(beforeConfirm)
      .find(
        (c) =>
          c.method === "sendMessage" &&
          c.payload.chat_id === -1001 &&
          typeof c.payload.text === "string" &&
          c.payload.text.includes("Settlement cleared"),
      );
    expect(cleared).toBeDefined();
  });

  it("rejects settle when only one member", async () => {
    const bot = makeBot();
    const calls = captureCalls(bot);

    await initTrip(bot);
    await handle(bot, groupTextUpdate("✅ Settle"));

    const settleMsg = calls.at(-1);
    expect(settleMsg?.method).toBe("sendMessage");
    expect(settleMsg?.payload.text).toBe(
      "Add another member before settling.",
    );
  });
});