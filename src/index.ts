/**
 * TripSplit — entry point.
 *
 * Button-first UX: reply-keyboard main menu + inline action buttons.
 * Slash commands remain as harness fallbacks.
 */
import { createBot } from "@agntdev/bot-toolkit";
import { registerHelp } from "./commands/help";
import { registerInitTrip } from "./commands/initTrip";
import type { Ctx } from "./context";
import { tripAccessMiddleware } from "./middleware/access";
import { createRepository, type Repository } from "./storage/repository";
import { initialSession, type Session } from "./types";
import { registerMenu } from "./ui/menu";

export type { Ctx } from "./context";

export function makeBot(repo: Repository = createRepository()) {
  const bot = createBot<Session>(process.env.BOT_TOKEN!, {
    initial: initialSession,
  });

  bot.use(tripAccessMiddleware(repo));

  registerMenu(bot, repo);
  registerHelp(bot, repo);
  registerInitTrip(bot, repo);

  return bot;
}

if (require.main === module) {
  const bot = makeBot();
  bot.start();
}