/**
 * BotSpec gate — telegram-test-specs publish gate.
 * Declarative JSON specs; fresh makeBot() per spec.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeCoverage, runSpecs } from "@agntdev/bot-toolkit";
import { describe, expect, it } from "vitest";
import { makeBot } from "../src/index";

process.env.HARNESS = "1";
process.env.BOT_TOKEN = "0:TEST";

const specs = JSON.parse(
  readFileSync(join(__dirname, "specs.json"), "utf8"),
);
const commands = JSON.parse(
  readFileSync(join(__dirname, "commands.json"), "utf8"),
);

describe("BotSpec gate (telegram-test-specs)", () => {
  it("passes all dialog specs with full command coverage", async () => {
    const suite = await runSpecs(makeBot, specs);
    const coverage = computeCoverage(specs, commands);

    for (const result of suite.results) {
      if (!result.ok) {
        const detail = result.steps
          .flatMap((s) => s.failures)
          .join("; ");
        throw new Error(`${result.name}: ${detail}`);
      }
    }

    expect(suite.failed).toBe(0);
    expect(suite.total).toBeGreaterThan(0);
    expect(coverage.missing).toEqual([]);
    expect(coverage.fraction).toBe(1);
  });
});