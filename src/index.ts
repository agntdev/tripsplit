/**
 * TripSplit — entry point.
 *
 * Button-only UX: reply-keyboard main menu + inline action buttons.
 */
import { createBot } from "@agntdev/bot-toolkit";
import { registerExpenseFlow } from "./flows/expense";
import { registerMembersFlow } from "./flows/members";
import { registerSettlementFlow } from "./flows/settlementFlow";
import type { Ctx } from "./context";
import { tripAccessMiddleware } from "./middleware/access";
import { registerNoSlashCommands } from "./middleware/noSlashCommands";
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
  registerExpenseFlow(bot, repo);
  registerMembersFlow(bot, repo);
  registerSettlementFlow(bot, repo);
  registerNoSlashCommands(bot);

  return bot;
}

if (require.main === module) {
  const bot = makeBot();
  bot.start();
}