# TripSplit Bot — Design Document

This document specifies the architecture, the full command set, and the
conversation/UX flows for TripSplit described in
[`docs/general.md`](./general.md). It is the contract the Details, Dev, and
Tests phases build against.

TripSplit is a **Telegram group bot** that tracks shared trip expenses in
**USD cents**, computes net balances, suggests minimal repayments, and
facilitates **manual, double-confirmed settlements** via DM. Each Telegram
group maps to exactly one trip.

---

## 1. Architecture

### 1.1 Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript | Toolkit + harness are typed |
| Bot framework | [grammY](https://grammy.dev) | Group commands, callbacks, DM routing |
| Harness wrapper | `@agntdev/bot-toolkit` (`createBot` / `makeBot`) | Session + error boundary wired for the tokenless test harness |
| Persistence | PostgreSQL | Trips, expenses, settlements, audit logs (per `general.md`) |
| HTTP server | Node.js webhook handler (prod) / long poll (dev) | Standard agntdev deploy model |
| Money | Integer **cents** everywhere | No floating-point drift; display as `$X.YY` |

The bot is a single long-running Node process. In dev/harness it long-polls; in
production it receives Telegram webhooks. No external payment or currency APIs.

### 1.2 Component map

```
┌─────────────────────────────────────────────────────────────────┐
│                         makeBot() factory                         │
│                       (src/index.ts export)                       │
│                                                                   │
│   createBot<Session>(BOT_TOKEN, { initial, storage, onError })    │
└───────────────┬───────────────────────────────┬─────────────────┘
                │                                 │
        Update pipeline                    Settlement notifier
        (grammY middleware)                (DM dispatch + expiry sweep)
                │                                 │
   ┌────────────┴────────────┐          ┌─────────┴──────────┐
   │  commands/   flows/      │          │  services/ledger   │
   │  /init_trip /expense …   │          │  services/split    │
   │  callbacks (inline UI)   │          │  services/settle   │
   └────────────┬────────────┘          │  services/export   │
                │                       └─────────┬──────────┘
                ▼                                   ▼
        ┌───────────────────────────────────────────────────┐
        │   storage/ repositories (Trip, Participant,         │
        │   Expense, Share, Settlement, AuditLog)             │
        │   PostgreSQL                                        │
        └───────────────────────────────────────────────────┘
```

### 1.3 Project structure

```
src/
├── index.ts              # makeBot() factory — THE mandatory harness export
├── config.ts             # env + constants (settlement expiry days, etc.)
├── commands/
│   ├── initTrip.ts       # /init_trip
│   ├── add.ts            # /add @user
│   ├── remove.ts         # /remove @user
│   ├── expense.ts        # /expense <amount> [description]
│   ├── balances.ts       # /balances
│   ├── suggested.ts      # /suggested
│   ├── settle.ts         # /settle @payee <amount>
│   ├── tripSummary.ts    # /trip_summary (organizer DM export)
│   └── help.ts           # /help
├── flows/
│   ├── expenseWizard.ts  # payer → participants → split type → confirm
│   └── settlementFlow.ts # payer confirm + payee DM confirm
├── services/
│   ├── ledger.ts         # balance computation from expenses + settlements
│   ├── split.ts          # even/custom split + rounding (payer absorbs remainder)
│   ├── simplify.ts       # greedy minimal repayment set
│   ├── settle.ts         # create/confirm/expire settlement records
│   └── export.ts         # CSV audit export for organizer
├── storage/
│   ├── repository.ts     # CRUD for all entities
│   └── schema.sql        # table definitions
└── types.ts              # Session, Trip, Expense, Settlement types
tests/
└── specs/                # BotSpec JSON fixtures (Tests phase)
```

### 1.4 The `makeBot()` factory (harness contract)

The harness requires a **fresh bot per spec run**, so the bot is created by an
exported factory, never a module-level singleton:

```ts
// src/index.ts
import { createBot } from "@agntdev/bot-toolkit";
import type { Session } from "./types";

export function makeBot() {
  const bot = createBot<Session>(process.env.BOT_TOKEN!, {
    initial: (): Session => ({ step: "idle", draft: {} }),
    // storage: postgresSessionAdapter()  // prod; omit → MemorySessionStorage in harness
  });

  registerCommands(bot);
  registerFlows(bot);
  registerCallbacks(bot);
  return bot;
}

if (require.main === module) {
  const bot = makeBot();
  startSettlementExpirySweep(bot); // optional background job; skipped under harness
  bot.start();
}
```

### 1.5 Data model

Mirrors the Core Entities in `docs/general.md`.

| Entity | Key fields | Notes |
|---|---|---|
| **Trip** | `id`, `telegram_group_id` (unique), `organizer_user_id`, `created_at` | One trip per group; created by `/init_trip` |
| **Participant** | `id`, `trip_id`, `telegram_user_id`, `display_name`, `active`, `joined_at`, `removed_at` | Soft-remove via `active=false`; past shares remain |
| **Expense** | `id`, `trip_id`, `payer_user_id`, `amount_cents`, `description`, `created_at` | **Immutable** — no UPDATE/DELETE |
| **Share** | `id`, `expense_id`, `participant_user_id`, `share_cents` | Per-expense; Σ shares = expense amount |
| **Settlement** | `id`, `trip_id`, `payer_user_id`, `payee_user_id`, `amount_cents`, `status`, `payer_confirmed_at`, `payee_confirmed_at`, `expires_at` | `status`: `pending` → `cleared` or `expired` |
| **AuditLog** | `id`, `trip_id`, `actor_user_id`, `action`, `payload_json`, `created_at` | Participant add/remove, settlement events |

**Balance computation** (not stored, computed on demand):

```
net_balance(user) =
  Σ(expenses where user is payer: +amount_cents)
  − Σ(shares owed by user across all expenses)
  − Σ(cleared settlements where user is payer: +amount_cents)
  + Σ(cleared settlements where user is payee: +amount_cents)
```

Positive balance = others owe this user; negative = this user owes others.

### 1.6 Split & rounding rules

All amounts are integer cents.

**Even split** among *N* participants (including payer if selected):

1. `base = floor(amount_cents / N)`
2. `remainder = amount_cents − base × N`
3. Each participant gets `base`; payer's share gets `base + remainder`

**Custom split** (cents or percentages):

1. Parse per-participant values; percentages → cents via `floor`, track running total
2. Validate Σ participant shares ≤ `amount_cents`
3. Assign any leftover cents to the **payer's share** so Σ shares = `amount_cents`

**Corrections**: expenses are immutable. A mistake is fixed by logging a new
expense (including negative `amount_cents` adjustment entries).

### 1.7 Debt simplification

`/suggested` runs a **greedy pairing** algorithm on current net balances:

1. Build lists of creditors (balance > 0) and debtors (balance < 0), sorted by magnitude
2. While both lists are non-empty: pair largest creditor with largest debtor;
   transfer `min(creditor_balance, |debtor_balance|)`
3. Output ephemeral suggested payments (not persisted until `/settle`)

### 1.8 Access control

- Commands run in a **group** require an active trip for that `chat.id`
- Only **active participants** may execute commands (except `/help`)
- `/trip_summary` is available to any participant; CSV is sent to the **issuer's DM**
- Settlement DM buttons are scoped to the payer/payee `telegram_user_id`
- Non-participants receive: "You're not a participant in this trip."

### 1.9 External dependencies & resilience

- **Telegram Bot API**: group messages, inline keyboards, DM for settlements and
  exports. Token from `process.env.BOT_TOKEN` — never committed.
- **PostgreSQL**: sole persistence. Connection via `DATABASE_URL`.
- **No payment processors** (Non-goals).
- DB errors → user-facing "Something went wrong, try again." + `bot.catch()` logs.
- Settlement expiry sweep (default **7 days**, `SETTLEMENT_EXPIRY_DAYS`): marks
  stale `pending` settlements as `expired`.

---

## 2. Command Set

All commands are issued in the **trip's Telegram group** unless noted. Amounts
accept dollars (`12.50`) or integer cents (`1250`); the parser normalizes to
cents.

| Command | Args | Who | Purpose |
|---|---|---|---|
| `/help` | — | anyone | Show command reference |
| `/init_trip` | — | group member | Create the trip; issuer becomes organizer |
| `/add` | `@username` | participant | Add a participant (resolve @mention → user id) |
| `/remove` | `@username` | participant | Soft-remove participant (past shares remain) |
| `/expense` | `<amount> [description]` | participant | Start expense wizard |
| `/balances` | — | participant | Show net balance per participant |
| `/suggested` | — | participant | Show minimal repayment suggestions |
| `/settle` | `@payee <amount>` | participant (payer) | Initiate settlement toward payee |
| `/trip_summary` | — | participant | DM organizer-grade CSV audit export |

Inline buttons on balance/suggested screens duplicate `/balances`, `/suggested`,
and quick-settle actions where applicable.

### 2.1 `/init_trip`

- Fails if a trip already exists for this group: "This group already has a trip."
- Creates `Trip` row with `telegram_group_id = chat.id`, `organizer_user_id = from.id`
- Seeds `Participant` rows for every current group member the bot can resolve
  (at minimum: the issuer; others added as they interact or via `/add`)
- Writes `AuditLog` action `trip_created`
- Replies in-group:

```
✅ Trip initialized!
Organizer: @alice
Participants: 3
Use /expense to log spending or /help for commands.
```

### 2.2 `/add` and `/remove`

**`/add @bob`**
- Resolves `@bob` to `telegram_user_id` (via message entities)
- Upserts participant (`active=true`)
- AuditLog: `participant_added`
- Reply: "Added @bob to the trip."

**`/remove @bob`**
- Sets `active=false`, `removed_at=now()`
- Does **not** alter historical shares
- AuditLog: `participant_removed`
- Reply: "@bob removed. Past expenses still count toward their balance."

### 2.3 `/expense <amount> [description]`

Starts the **expense wizard** (session-driven, inline keyboards).

**Args**
- `amount`: required; parsed to cents (`12.5` → `1250`)
- `description`: optional free text (max 200 chars)

**Wizard steps** (see §3.2): payer → participants → split type → confirm → post.

### 2.4 `/balances`

Computes and posts a monospace table:

```
Balances (USD):
@alice   +$45.00  (owed to them)
@bob     −$20.00
@carol   −$25.00

[suggested payments]  [log expense]
```

### 2.5 `/suggested`

Runs §1.7 algorithm, posts ephemeral suggestions:

```
Suggested payments:
1. @bob pays @alice $20.00
2. @carol pays @alice $25.00

[settle…]  [refresh]
```

Tapping `[settle…]` on a row pre-fills `/settle` for that pair.

### 2.6 `/settle @payee <amount>`

- Issuer must be the **payer** (or initiator becomes payer)
- Creates `Settlement` (`status=pending`, `expires_at=now+7d`)
- Posts in-group:

```
Settlement started: @alice → @bob $15.00
@alice, confirm when you've paid:
[I paid]
```

- On payer tap `[I paid]`: `payer_confirmed_at` set; bot DMs payee:

```
@alice says they paid you $15.00 for the trip.
[Confirm receipt]   [Dispute]
```

- On payee `[Confirm receipt]`: both timestamps set → `status=cleared`; group announcement
- `[Dispute]` leaves settlement `pending`; organizer uses `/trip_summary`

### 2.7 `/trip_summary`

- Builds CSV: expenses, shares, settlements, computed balances
- Sends as `document` to requester's **DM** (not the group)
- If DM blocked: "Please start a private chat with me first: t.me/<bot>?start=trip"
- AuditLog: `export_requested`

### 2.8 Cancel / fallback

| Trigger | Behavior |
|---|---|
| Inline `[Cancel]` in any wizard | Clear `session.step`, reply "Cancelled." |
| Unknown command | "Unknown command. Try /help." |
| Command with no trip | "No trip here yet. Run /init_trip first." |
| Non-participant | "You're not a participant in this trip." |
| `callback_query` for another user's button | `answerCallbackQuery({ text: "Not yours", show_alert: true })` |

---

## 3. Conversation and UX Flows

All multi-step flows use `ctx.session` and inline keyboards. The bot asks **one
question per message**.

### 3.1 Trip initialization (`/init_trip`)

```
User:    /init_trip
Bot:     ✅ Trip initialized!
         Organizer: @alice
         Participants: 1
         Use /expense to log spending or /help for commands.
```

If trip exists:

```
User:    /init_trip
Bot:     This group already has a trip. Use /balances to see where you stand.
```

### 3.2 Expense wizard (`/expense`)

```
User:    /expense 48.50 dinner
Bot:     New expense: $48.50 — dinner
         Who paid?
         [@alice] [@bob] [@carol]   [Cancel]

User:    [taps @bob]
Bot:     Split among whom?
         [Everyone] [Pick people…]   [Cancel]

User:    [Everyone]
Bot:     How to split $48.50?
         [Even]   [Custom amounts]   [Custom %]   [Cancel]

User:    [Even]
Bot:     Confirm expense:
         Payer: @bob
         Split: even among 3 → @bob $16.17, @alice $16.16, @carol $16.17
         (payer absorbs +$0.01 rounding)
         [Post expense]   [Back]   [Cancel]

User:    [Post expense]
Bot:     ✅ Logged: @bob paid $48.50 for dinner
         Updated balances:
         @alice  +$16.16
         @bob    −$32.33
         @carol  +$16.17
```

**Custom amounts flow**: bot prompts sequentially or via a compact list; validates
Σ = amount; remainder → payer share.

**Custom % flow**: convert each % to cents (floor), remainder → payer.

### 3.3 Balance check (`/balances`)

```
User:    /balances
Bot:     Balances (USD):
         @alice   +$45.00
         @bob     −$20.00
         @carol   −$25.00

         [Suggested payments]   [Log expense]
```

### 3.4 Suggested payments (`/suggested`)

```
User:    /suggested
Bot:     Suggested payments:
         1. @bob pays @alice $20.00
         2. @carol pays @alice $25.00

         [Settle #1] [Settle #2]   [Refresh]
```

### 3.5 Settlement flow (`/settle`)

```
User:    /settle @alice 20.00
Bot:     Settlement started: @bob → @alice $20.00
         @bob, confirm when you've paid:
         [I paid]   [Cancel]

User:    [I paid]          (in group or DM)
Bot→grp: @bob marked payment sent. Waiting for @alice to confirm.
Bot→DM:  @bob says they paid you $20.00 for the trip.
         [Confirm receipt]   [Dispute]

User:    [Confirm receipt]   (alice, in DM)
Bot→grp: ✅ Settlement cleared: @bob → @alice $20.00
Bot→DM:  Receipt confirmed. Thanks!
```

**Expiry** (background sweep):

```
Bot→grp: ⏱ Settlement expired: @bob → @alice $20.00 was not confirmed in 7 days.
         Start again with /settle if still needed.
```

### 3.6 Organizer export (`/trip_summary`)

```
User:    /trip_summary        (in group)
Bot→grp: Sending the audit export to your DM…
Bot→DM:  TripSplit audit export (group <title>)
         <tripsplit_audit.csv attached>
```

CSV columns: `expense_id`, `timestamp`, `payer`, `description`, `amount_cents`,
`participant`, `share_cents`, `settlement_id`, `settlement_status`, `net_balance`.

### 3.7 Mid-trip membership changes

**New participant added after expenses exist**

- `/add @dave` adds Dave as active
- Dave is **not** retroactively included in past expenses
- Future expenses may include Dave via participant picker

**Participant removed**

- `/remove @carol` sets `active=false`
- Carol's historical shares remain in ledger until settled
- Carol cannot run new commands; existing pending settlements involving Carol remain valid

### 3.8 Edge cases & copy

| Situation | Bot response |
|---|---|
| Invalid amount | "Couldn't parse amount. Example: `/expense 12.50 coffee`" |
| Custom split doesn't sum | "Shares must total $48.50. You're $0.03 short — adjust or use Even." |
| Settle more than owed | "That amount exceeds the suggested/ledger balance. Check /balances." |
| Payee never started DM | "I can't DM @alice yet. They need to tap Start in a private chat with me." |
| Duplicate `/init_trip` | "This group already has a trip." |
| Negative adjustment | `/expense -5.00 correction` logs immutable correction entry |

---

## 4. Message copy & tone

- **Tone**: concise, friendly, travel-group practical. No financial jargon.
- **Currency display**: always `$X.YY` in messages; store cents internally.
- **Names**: prefer `@username`, fall back to first name from Telegram profile.
- **Confirmations**: one ✅ line for success; one sentence for errors.
- **Privacy**: never post CSV exports or settlement DM content in the group beyond the minimal status line.

---

## 5. Non-goals (design enforcement)

Per `docs/general.md`, the implementation must **not**:

- Integrate TON or any on-chain/fiat payment rail
- Support multi-currency (USD cents only)
- Auto-clear settlements without dual confirmation
- Host multiple trips in one group
- Store wallet credentials or execute transfers

These are architectural boundaries, not deferred features.