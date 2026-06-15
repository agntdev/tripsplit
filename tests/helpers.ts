/**
 * Test helpers — telegram-test-advanced pattern.
 * Group-chat builders for TripSplit + capture / fail transformers.
 */
import type { Bot, Transformer } from "grammy";
import type { Update } from "grammy/types";

export const GROUP_ID = -1001;
export const ALICE_ID = 1001;
export const BOB_ID = 1002;

export const FAKE_BOT_INFO = {
  id: 42,
  is_bot: true,
  first_name: "TestBot",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
} as const;

export interface CapturedCall {
  method: string;
  payload: Record<string, unknown>;
}

let seq = 0;

export function resetSeq(): void {
  seq = 0;
}

function humanUser(id: number, name: string, username?: string) {
  return {
    id,
    is_bot: false as const,
    first_name: name,
    ...(username ? { username } : {}),
  };
}

function groupChat(id = GROUP_ID) {
  return { id, type: "supergroup" as const, title: "Trip" };
}

function stubResult(
  method: string,
  payload: Record<string, unknown>,
  msgId: number,
): unknown {
  if (/^(send|edit|copy|forward)/.test(method)) {
    return {
      message_id: msgId,
      date: 0,
      chat: { id: (payload.chat_id as number) ?? GROUP_ID, type: "supergroup" },
      ...(typeof payload.text === "string" ? { text: payload.text } : {}),
    };
  }
  return true;
}

export interface CaptureOptions {
  failOn?: (
    method: string,
    payload: Record<string, unknown>,
  ) => { error_code: number; description: string; parameters?: unknown } | null;
}

/** Record outgoing API calls; optionally fail specific methods (§4 adversarial). */
export function captureCalls(bot: Bot<unknown>, opts?: CaptureOptions): CapturedCall[] {
  const calls: CapturedCall[] = [];
  (bot as unknown as { botInfo: typeof FAKE_BOT_INFO }).botInfo = FAKE_BOT_INFO;
  let stubMsgId = 1000;

  const capture: Transformer = async (_prev, method, payload) => {
    const p = (payload ?? {}) as Record<string, unknown>;
    const fail = opts?.failOn?.(method, p);
    if (fail) {
      return { ok: false, ...fail } as Awaited<ReturnType<Transformer>>;
    }
    calls.push({ method, payload: p });
    return {
      ok: true,
      result: stubResult(method, p, ++stubMsgId),
    } as Awaited<ReturnType<Transformer>>;
  };

  bot.api.config.use(capture);
  return calls;
}

export function failWith(
  bot: Bot<unknown>,
  resp: { error_code: number; description: string; parameters?: unknown },
): void {
  (bot as unknown as { botInfo: typeof FAKE_BOT_INFO }).botInfo = FAKE_BOT_INFO;
  bot.api.config.use(
    async () => ({ ok: false, ...resp }) as Awaited<ReturnType<Transformer>>,
  );
}

/** Drain floated promises (matches harness settle). */
export async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
}

export async function handle(bot: Bot<unknown>, update: Update): Promise<void> {
  await bot.handleUpdate(update);
  await settle();
}

export function groupTextUpdate(
  text: string,
  opts?: {
    userId?: number;
    name?: string;
    username?: string;
    entities?: Update["message"] extends infer M
      ? M extends { entities?: infer E }
        ? E
        : never
      : never;
  },
): Update {
  const id = ++seq;
  const userId = opts?.userId ?? ALICE_ID;
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 0,
      chat: groupChat(),
      from: humanUser(userId, opts?.name ?? "Alice", opts?.username ?? "alice"),
      text,
      ...(opts?.entities ? { entities: opts.entities } : {}),
    },
  };
}

export function groupSlashUpdate(text: string, userId = ALICE_ID): Update {
  const cmdLen = text.split(" ")[0]?.length ?? text.length;
  return groupTextUpdate(text, {
    userId,
    entities: [{ type: "bot_command", offset: 0, length: cmdLen }],
  });
}

export function groupCallbackUpdate(
  data: string,
  opts?: { userId?: number; name?: string; username?: string; messageId?: number },
): Update {
  const id = ++seq;
  const userId = opts?.userId ?? ALICE_ID;
  return {
    update_id: id,
    callback_query: {
      id: String(id),
      from: humanUser(userId, opts?.name ?? "Alice", opts?.username ?? "alice"),
      message: {
        message_id: opts?.messageId ?? 10,
        date: 0,
        chat: groupChat(),
        from: { id: FAKE_BOT_INFO.id, is_bot: true, first_name: "TestBot" },
        text: "(previous)",
      },
      chat_instance: `ci-${GROUP_ID}`,
      data,
    },
  };
}

export function privateCallbackUpdate(
  data: string,
  userId: number,
  name: string,
): Update {
  const id = ++seq;
  return {
    update_id: id,
    callback_query: {
      id: String(id),
      from: humanUser(userId, name),
      message: {
        message_id: 20,
        date: 0,
        chat: { id: userId, type: "private", first_name: name },
        from: { id: FAKE_BOT_INFO.id, is_bot: true, first_name: "TestBot" },
        text: "(dm)",
      },
      chat_instance: `ci-${userId}`,
      data,
    },
  };
}

/** text_mention entity for adding members. */
export function groupMentionUpdate(
  label: string,
  mentioned: { id: number; first_name: string; username?: string },
  fromUserId = ALICE_ID,
): Update {
  const text = `add ${label}`;
  const offset = text.indexOf(label);
  return groupTextUpdate(text, {
    userId: fromUserId,
    entities: [
      {
        type: "text_mention",
        offset,
        length: label.length,
        user: humanUser(
          mentioned.id,
          mentioned.first_name,
          mentioned.username,
        ),
      },
    ],
  });
}

/** Photo with no handler — bot should ignore (edge-case fixture §5). */
export function groupPhotoUpdate(userId = ALICE_ID): Update {
  const id = ++seq;
  return {
    update_id: id,
    message: {
      message_id: id,
      date: 0,
      chat: groupChat(),
      from: humanUser(userId, "Alice", "alice"),
      photo: [
        {
          file_id: "AgAC",
          file_unique_id: "u",
          width: 90,
          height: 90,
        },
      ],
    },
  };
}

export async function initTrip(bot: Bot<unknown>): Promise<void> {
  await handle(bot, groupTextUpdate("🚀 Start Trip"));
}

export async function addBob(bot: Bot<unknown>): Promise<void> {
  await handle(bot, groupCallbackUpdate("ts:members:add"));
  await handle(
    bot,
    groupMentionUpdate("@bob", {
      id: BOB_ID,
      first_name: "Bob",
      username: "bob",
    }),
  );
}

export async function logEvenExpense(
  bot: Bot<unknown>,
  amountText: string,
  payerId: number,
): Promise<void> {
  await handle(bot, groupTextUpdate("💰 Log Expense"));
  await handle(bot, groupTextUpdate(amountText));
  await handle(bot, groupCallbackUpdate(`ts:expense:payer:${payerId}`));
  await handle(bot, groupCallbackUpdate("ts:expense:everyone"));
  await handle(bot, groupCallbackUpdate("ts:expense:split:even"));
  await handle(bot, groupCallbackUpdate("ts:expense:post"));
}