import type { Ctx } from "../context";
import { isGroupChat } from "../middleware/access";
import type { Repository } from "../storage/repository";
import { HELP_TEXT } from "../ui/labels";
import { mainMenuReplyKeyboard, preTripReplyKeyboard } from "../ui/keyboards";

export async function showHelp(ctx: Ctx, repo: Repository): Promise<void> {
  const inGroup = isGroupChat(ctx);
  const trip = inGroup && ctx.chat
    ? repo.getTripByGroupId(ctx.chat.id)
    : undefined;

  const keyboard = trip ? mainMenuReplyKeyboard() : preTripReplyKeyboard();
  await ctx.reply(HELP_TEXT, { reply_markup: keyboard });
}