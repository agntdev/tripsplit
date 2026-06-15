import { InputFile } from "grammy";
import type { Ctx } from "../context";
import { buildAuditCsv } from "../services/export";
import type { Repository } from "../storage/repository";
import { privateChatLink } from "../utils/botLink";

export async function runTripExport(
  ctx: Ctx,
  repo: Repository,
): Promise<void> {
  if (!ctx.trip || !ctx.from) return;

  await ctx.reply("Sending the audit export to your DM…");

  const csv = buildAuditCsv(ctx.trip.id, repo);
  repo.appendAuditLog(ctx.trip.id, ctx.from.id, "export_requested");

  try {
    await ctx.api.sendDocument(
      ctx.from.id,
      new InputFile(Buffer.from(csv, "utf-8"), "tripsplit_audit.csv"),
      { caption: `TripSplit audit export (group ${ctx.trip.telegramGroupId})` },
    );
  } catch {
    await ctx.reply(`Please start ${privateChatLink()} first.`);
  }
}