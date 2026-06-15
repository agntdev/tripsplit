/**
 * Tests-phase gate runner — emits GATE:<nonce>:{verdict} for the platform.
 * Run: npm run build && npm run test:gate
 */
import { readFile } from "node:fs/promises";
import { computeCoverage, runSpecs } from "@agntdev/bot-toolkit";
import { makeBot } from "../dist/index.js";

const MARKER = "GATE:";
const nonce = process.env.AGNTDEV_GATE_NONCE ?? "";

process.env.HARNESS = "1";
process.env.BOT_TOKEN = process.env.BOT_TOKEN ?? "0:TEST";

const specs = JSON.parse(await readFile("tests/specs.json", "utf8"));
const commands = JSON.parse(await readFile("tests/commands.json", "utf8"));

const suite = await runSpecs(makeBot, specs);
const coverage = computeCoverage(specs, commands);
const ok = suite.failed === 0 && suite.total > 0 && coverage.missing.length === 0;

const verdict = {
  ok,
  total: suite.total,
  passed: suite.passed,
  failed: suite.failed,
  coverage,
  results: suite.results.map((r) => ({ name: r.name, ok: r.ok })),
};

process.stdout.write(MARKER + nonce + ":" + JSON.stringify(verdict) + "\n");
process.exit(ok ? 0 : 1);