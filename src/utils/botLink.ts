/** Deep link shown when the bot cannot DM a user yet. */
export function privateChatLink(): string {
  const username = process.env.BOT_USERNAME;
  return username ? `t.me/${username}?start=trip` : "a private chat with me";
}