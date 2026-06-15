/**
 * Error & adversarial paths — telegram-test-advanced §4.
 */
import { GrammyError } from "grammy";
import { describe, expect, it, beforeEach } from "vitest";
import { makeBot } from "../src/index";
import {
  captureCalls,
  failWith,
  groupPhotoUpdate,
  groupSlashUpdate,
  groupTextUpdate,
  handle,
  initTrip,
  resetSeq,
} from "./helpers";

process.env.HARNESS = "1";
process.env.BOT_TOKEN = "0:TEST";

describe("adversarial paths", () => {
  beforeEach(() => resetSeq());

  it("surfaces GrammyError when Telegram rate-limits", async () => {
    const bot = makeBot();
    failWith(bot, {
      error_code: 429,
      description: "Too Many Requests",
      parameters: { retry_after: 5 },
    });

    await expect(
      handle(bot, groupTextUpdate("🚀 Start Trip")),
    ).rejects.toSatisfy((err: unknown) => {
      const wrapped = err as { error?: unknown };
      const cause = wrapped.error ?? err;
      return (
        cause instanceof GrammyError &&
        (cause as GrammyError).error_code === 429
      );
    });
  });

  it("handles blocked DM on export without crashing", async () => {
    const bot = makeBot();
    const calls = captureCalls(bot, {
      failOn: (method) =>
        method === "sendDocument"
          ? {
              error_code: 403,
              description: "bot was blocked by the user",
            }
          : null,
    });

    await initTrip(bot);
    await handle(bot, groupTextUpdate("📁 Export"));

    const ack = calls.find(
      (c) =>
        c.method === "sendMessage" &&
        c.payload.text === "Sending the audit export to your DM…",
    );
    expect(ack).toBeDefined();

    const fallback = calls.find(
      (c) =>
        c.method === "sendMessage" &&
        typeof c.payload.text === "string" &&
        c.payload.text.includes("private chat"),
    );
    expect(fallback).toBeDefined();
  });

  it("ignores photo messages with no handler", async () => {
    const bot = makeBot();
    const calls = captureCalls(bot);

    await initTrip(bot);
    await handle(bot, groupPhotoUpdate());

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("sendMessage");
  });

  it("rejects slash commands in group", async () => {
    const bot = makeBot();
    const calls = captureCalls(bot);

    await handle(bot, groupSlashUpdate("/balances"));

    expect(calls).toHaveLength(1);
    expect(calls[0].payload.text).toContain("buttons only");
  });
});