/**
 * TripSplit — entry point.
 *
 * Exposes the mandatory `makeBot()` factory the test harness imports. It must
 * return a FRESH bot on every call (never a module-level singleton).
 * See docs/design.md §1.4.
 */
import { createBot } from "@agntdev/bot-toolkit";
import { registerInitTrip } from "./commands/initTrip";
import type { Ctx } from "./context";
import { tripAccessMiddleware } from "./middleware/access";
import { createRepository, type Repository } from "./storage/repository";
import { initialSession, type Session } from "./types";

export type { Ctx } from "./context";

/**
 * Build a fresh bot instance. Feature tasks (F02–F10) register command and
 * flow handlers here.
 */
export function makeBot(repo: Repository = createRepository()) {
  const bot = createBot<Session>(process.env.BOT_TOKEN!, {
    initial: initialSession,
  });

  bot.use(tripAccessMiddleware(repo));

  registerInitTrip(bot, repo);

  return bot;
}

// Standalone run (outside the harness).
if (require.main === module) {
  const bot = makeBot();
  bot.start();
}