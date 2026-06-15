import type { Message } from "grammy/types";
import { displayName } from "./display";

export interface ResolvedMention {
  userId: number;
  label: string;
}

/** Resolve the first @mention or text_mention from a message. */
export function resolveMention(message: Message): ResolvedMention | null {
  const text = message.text ?? "";
  const entities = message.entities ?? [];

  for (const entity of entities) {
    if (entity.type === "text_mention" && entity.user) {
      return {
        userId: entity.user.id,
        label: displayName(entity.user),
      };
    }
  }

  return null;
}

/** @mention label when user id is unavailable (for error messages). */
export function mentionLabel(message: Message): string | null {
  const text = message.text ?? "";
  for (const entity of message.entities ?? []) {
    if (entity.type === "mention" || entity.type === "text_mention") {
      return text.slice(entity.offset, entity.offset + entity.length);
    }
  }
  return null;
}