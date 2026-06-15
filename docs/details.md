# TripSplit Bot — DETAILS Document

Concrete per-command behaviour spec for implementation and BotSpec authoring.
Derived from [`docs/design.md`](./design.md) and [`docs/general.md`](./general.md).

All group commands require `chat.type ∈ {group, supergroup}` unless noted.
Amounts are stored as **integer cents**; displayed as `$X.YY`.

---

## SESSION MODEL

`ctx.session` shape (per chat + user in harness):

```ts
type Session = {
  step: SessionStep;
  draft: ExpenseDraft | SettlementDraft | null;
};

type SessionStep =
  | "idle"
  | "expense_payer"
  | "expense_participants"
  | "expense_pick_people"
  | "expense_split_type"
  | "expense_custom_amounts"
  | "expense_custom_percent"
  | "expense_confirm";
```

- Only **one active wizard** per user per chat. Starting `/expense` while in a
  wizard replaces the draft and resets to `expense_payer`.
- `[Cancel]` sets `step = "idle"`, `draft = null`, replies `"Cancelled."`
- Callback `data` prefix: `ts:` (e.g. `ts:expense:payer:12345`)

---

## ACCESS CONTROL MIDDLEWARE

Runs before every group command handler (except `/help`):

1. Load `Trip` by `ctx.chat.id`. Missing → reply `"No trip here yet. Run /init_trip first."` and stop.
2. Load `Participant` for `ctx.from.id` with `active=true`. Missing → reply `"You're not a participant in this trip."` and stop.
3. Pass through to handler.

Callback queries validate `callback_query.from.id` matches the button's
intended actor (payer/payee/current wizard user). Mismatch →
`answerCallbackQuery({ text: "Not yours", show_alert: true })`.

---

## AMOUNT PARSER

`parseAmount(input: string): number | null`

| Input | Result (cents) |
|---|---|
| `12.50` | `1250` |
| `12.5` | `1250` |
| `1250` | `1250` (bare integer ≥ 100 treated as cents if no decimal) |
| `$48.50` | `4850` (strip `$`) |
| `-5.00` | `-500` (correction entries) |
| `abc` | `null` |

Display: `formatCents(c: number) → "$X.YY"` with sign prefix for negatives.

---

## SCREENS

### 1. Help Screen (State: `idle`, command `/help`)

- **Trigger**: `/help` in any chat (no trip required)
- **Message**:
  ```
  TripSplit — shared trip expenses

  /init_trip        Start a trip for this group
  /add @user        Add a participant
  /remove @user     Remove a participant
  /expense <amt>    Log an expense (interactive)
  /balances         Show net balances
  /suggested        Minimal repayment suggestions
  /settle @user <amt>  Start a settlement
  /trip_summary     Audit CSV export (sent to your DM)
  ```
- **Transitions**: none (stateless)

---

### 2. Trip Init Screen (State: `idle`, command `/init_trip`)

- **Precondition**: no existing `Trip` for `chat.id`
- **DB writes**:
  - `INSERT Trip(telegram_group_id, organizer_user_id)`
  - `INSERT Participant` for issuer (`active=true`)
  - `INSERT AuditLog(action=trip_created)`
- **Success message**:
  ```
  ✅ Trip initialized!
  Organizer: @alice
  Participants: 1
  Use /expense to log spending or /help for commands.
  ```
- **Duplicate trip**:
  ```
  This group already has a trip. Use /balances to see where you stand.
  ```

---

### 3. Participant Add Screen (command `/add @user`)

- **Args**: exactly one `@mention` entity in the message
- **Missing mention**: `"Usage: /add @username"`
- **Resolve** `@user` via `message.entities` → `telegram_user_id`
- **DB**: upsert `Participant(active=true, joined_at=now())`
- **AuditLog**: `participant_added`
- **Reply**: `"Added @bob to the trip."`
- **Unknown user** (no entity): `"Couldn't resolve @bob. They must send a message in this group first."`

---

### 4. Participant Remove Screen (command `/remove @user`)

- **Args**: one `@mention`
- **DB**: `UPDATE Participant SET active=false, removed_at=now()`
- **AuditLog**: `participant_removed`
- **Reply**: `"@bob removed. Past expenses still count toward their balance."`
- **Not a participant**: `"@bob is not an active participant."`

---

### 5. Expense Wizard — Payer (State: `expense_payer`)

- **Trigger**: `/expense <amount> [description]`
- **Parse amount**; on failure:
  `"Couldn't parse amount. Example: /expense 12.50 coffee"`
- **Description**: remainder of args after amount, trimmed, max 200 chars
- **Draft**: `{ amount_cents, description, payer_id: null, participant_ids: [], split_mode: null, shares: [] }`
- **Message**:
  ```
  New expense: $48.50 — dinner
  Who paid?
  ```
- **InlineKeyboard**: one button per active participant (`@name`), plus `[Cancel]`
- **Callback `ts:expense:payer:<user_id>`** → set `draft.payer_id`, `step = expense_participants`

---

### 6. Expense Wizard — Participants (State: `expense_participants`)

- **Message**:
  ```
  Split among whom?
  ```
- **InlineKeyboard**:
  ```
  [Everyone]   [Pick people…]   [Cancel]
  ```
- **`Everyone`**: `draft.participant_ids` = all active participants → `expense_split_type`
- **`Pick people…`**: `step = expense_pick_people`, show toggle list

---

### 7. Expense Wizard — Pick People (State: `expense_pick_people`)

- **InlineKeyboard**: toggle buttons per participant (`☑ @alice` / `☐ @alice`), `[Done]`, `[Cancel]`
- **Callback toggle**: add/remove from `draft.participant_ids`
- **`Done`**: require ≥1 selected → `expense_split_type`
- **Zero selected**: `"Select at least one person."`

---

### 8. Expense Wizard — Split Type (State: `expense_split_type`)

- **Message**:
  ```
  How to split $48.50?
  ```
- **InlineKeyboard**:
  ```
  [Even]   [Custom amounts]   [Custom %]   [Cancel]
  ```
- **`Even`**: compute shares via `splitEven(amount, participants, payer)` → `expense_confirm`
- **`Custom amounts`**: `step = expense_custom_amounts`, prompt per participant
- **`Custom %`**: `step = expense_custom_percent`, prompt per participant

---

### 9. Expense Wizard — Custom Amounts (State: `expense_custom_amounts`)

- **Flow**: for each participant in `draft.participant_ids`, prompt:
  `"How much for @alice? (e.g. 16.50 or 1650 cents)"`
- **Collect** `share_cents` per person
- **Validate**: Σ ≤ `amount_cents`; assign remainder to payer's share
- **Failure**: `"Shares must total $48.50. You're $0.03 short — adjust or use Even."`
- **Success** → `expense_confirm`

---

### 10. Expense Wizard — Custom Percent (State: `expense_custom_percent`)

- **Flow**: prompt each participant for percent (0–100)
- **Convert**: `floor(amount_cents * pct / 100)` per person; remainder → payer
- **Validate**: Σ percents ≤ 100 (allow < 100; remainder to payer)
- **Failure**: same as custom amounts if cents don't reconcile
- **Success** → `expense_confirm`

---

### 11. Expense Wizard — Confirm (State: `expense_confirm`)

- **Message template**:
  ```
  Confirm expense:
  Payer: @bob
  Split: even among 3 → @bob $16.17, @alice $16.16, @carol $16.17
  (payer absorbs +$0.01 rounding)
  ```
- **InlineKeyboard**: `[Post expense]` `[Back]` `[Cancel]`
- **`Post expense` DB** (single transaction):
  - `INSERT Expense` (immutable)
  - `INSERT Share` rows (one per participant)
  - `INSERT AuditLog(action=expense_created)`
- **Success**:
  ```
  ✅ Logged: @bob paid $48.50 for dinner
  Updated balances:
  @alice  +$16.16
  @bob    −$32.33
  @carol  +$16.17
  ```
- **Reset**: `step = idle`, `draft = null`

---

### 12. Balances Screen (command `/balances`)

- **Compute**: `ledger.computeBalances(trip_id)` per design formula
- **Message** (monospace block):
  ```
  Balances (USD):
  @alice   +$45.00
  @bob     −$20.00
  @carol   −$25.00
  ```
- **InlineKeyboard**:
  ```
  [Suggested payments]   [Log expense]
  ```
- **`Suggested payments`** → invoke `/suggested` handler inline
- **`Log expense`** → reply `"Use /expense <amount> [description] to log spending."`

---

### 13. Suggested Payments Screen (command `/suggested`)

- **Compute**: `simplify.greedyPairing(balances)` → list of `{ payer, payee, amount_cents }`
- **Empty balances** (all zero):
  `"Everyone is settled up! 🎉"`
- **Message**:
  ```
  Suggested payments:
  1. @bob pays @alice $20.00
  2. @carol pays @alice $25.00
  ```
- **InlineKeyboard**: `[Settle #1]` `[Settle #2]` … `[Refresh]`
- **`Settle #N`**: create pending settlement for that pair (same as `/settle @payee <amt>` with pre-filled amount)
- **`Refresh`**: recompute and redraw

---

### 14. Settlement Start Screen (command `/settle @payee <amount>`)

- **Args**: one `@mention` (payee) + amount
- **Payer**: `ctx.from.id`
- **Validation**:
  - payee is active participant
  - payee ≠ payer
  - amount > 0
  - amount ≤ payer's outstanding debt to payee (from ledger); else:
    `"That amount exceeds the suggested/ledger balance. Check /balances."`
- **DB**: `INSERT Settlement(status=pending, expires_at=now+7d)`
- **Message**:
  ```
  Settlement started: @bob → @alice $20.00
  @bob, confirm when you've paid:
  ```
- **InlineKeyboard** (only payer can tap): `[I paid]` `[Cancel]`
- **`Cancel`**: `status=expired` (or delete if no confirmations yet), reply `"Settlement cancelled."`

---

### 15. Settlement Payer Confirm (callback `ts:settle:paid:<settlement_id>`)

- **Actor**: payer only
- **DB**: `payer_confirmed_at = now()`
- **Group message**:
  `"@bob marked payment sent. Waiting for @alice to confirm."`
- **DM to payee**:
  ```
  @bob says they paid you $20.00 for the trip.
  ```
  **InlineKeyboard**: `[Confirm receipt]` `[Dispute]`
- **DM blocked**: group reply `"I can't DM @alice yet. They need to tap Start in a private chat with me: t.me/<bot>?start=trip"`

---

### 16. Settlement Payee Confirm (callback `ts:settle:confirm:<settlement_id>`, DM only)

- **Actor**: payee only
- **DB**: `payee_confirmed_at = now()`, `status=cleared`
- **AuditLog**: `settlement_cleared`
- **Group message**:
  `"✅ Settlement cleared: @bob → @alice $20.00"`
- **DM to payee**: `"Receipt confirmed. Thanks!"`

---

### 17. Settlement Dispute (callback `ts:settle:dispute:<settlement_id>`)

- **Actor**: payee only
- **No status change** (stays `pending`)
- **DM reply**: `"Marked as disputed. Ask the organizer for /trip_summary or settle again when resolved."`
- **Group**: no announcement (privacy)

---

### 18. Settlement Expiry (background sweep, every 1h)

- **Query**: `Settlement WHERE status=pending AND expires_at < now()`
- **DB**: `status=expired`
- **Group message**:
  ```
  ⏱ Settlement expired: @bob → @alice $20.00 was not confirmed in 7 days.
  Start again with /settle if still needed.
  ```

---

### 19. Trip Summary Export (command `/trip_summary`)

- **Trigger**: group command by any active participant
- **Group ack**: `"Sending the audit export to your DM…"`
- **DM document**: `tripsplit_audit.csv`
- **CSV columns**:
  `expense_id,timestamp,payer,description,amount_cents,participant,share_cents,settlement_id,settlement_status,net_balance`
- **One row per share** for expenses; settlement rows appended; final summary row per participant net balance
- **AuditLog**: `export_requested`
- **DM blocked**: `"Please start a private chat with me first: t.me/<bot>?start=trip"`

---

### 20. Error / Fallback Screen

| Trigger | Response |
|---|---|
| Unknown `/command` | `"Unknown command. Try /help."` |
| DB error | `"Something went wrong, try again."` (logged via `bot.catch`) |
| Wizard text while `step ≠ idle` | Route to current wizard step handler if input matches expected format; else repeat current prompt |
| Non-command text, `step = idle` | Ignore (no reply) |

---

## COMPONENTS

### 1. Participant Picker (`ParticipantPicker`)

- **Input**: `trip_id`, mode (`single` | `multi-toggle`)
- **Output**: inline keyboard with `callback_data` encoding `user_id`
- **Labels**: `@username` or first name fallback

### 2. Split Engine (`services/split.ts`)

| Function | Behaviour |
|---|---|
| `splitEven(amount, participantIds, payerId)` | floor division; remainder to payer |
| `splitCustomCents(amount, sharesMap, payerId)` | validate Σ; remainder to payer |
| `splitCustomPercent(amount, percentMap, payerId)` | floor per pct; remainder to payer |

### 3. Ledger (`services/ledger.ts`)

| Function | Behaviour |
|---|---|
| `computeBalances(tripId)` | Returns `Map<userId, cents>` per design formula |
| `getPairBalance(tripId, payer, payee)` | Net owed from payer to payee |

### 4. Debt Simplifier (`services/simplify.ts`)

| Function | Behaviour |
|---|---|
| `greedyPairing(balances)` | Returns ordered `{ payerId, payeeId, amountCents }[]` |

### 5. Settlement Service (`services/settle.ts`)

| Function | Behaviour |
|---|---|
| `createSettlement(...)` | Insert pending row |
| `confirmPayer(id, userId)` | Set payer timestamp |
| `confirmPayee(id, userId)` | Set payee timestamp + cleared |
| `expireStale()` | Batch expire for sweep |

### 6. CSV Exporter (`services/export.ts`)

| Function | Behaviour |
|---|---|
| `buildAuditCsv(tripId)` | Returns UTF-8 CSV string |

---

## COMMAND QUICK REFERENCE

| Command | Required state | DB tables touched |
|---|---|---|
| `/help` | none | none |
| `/init_trip` | no trip | Trip, Participant, AuditLog |
| `/add` | trip + participant | Participant, AuditLog |
| `/remove` | trip + participant | Participant, AuditLog |
| `/expense` | trip + participant | Expense, Share, AuditLog |
| `/balances` | trip + participant | none (read) |
| `/suggested` | trip + participant | none (read) |
| `/settle` | trip + participant | Settlement |
| `/trip_summary` | trip + participant | AuditLog (write); read all |

---

## CALLBACK DATA SCHEMA

| Pattern | Meaning |
|---|---|
| `ts:expense:payer:<uid>` | Select payer |
| `ts:expense:everyone` | All participants |
| `ts:expense:pick` | Enter pick-people mode |
| `ts:expense:toggle:<uid>` | Toggle participant in pick list |
| `ts:expense:pick:done` | Finish pick list |
| `ts:expense:split:even` | Even split |
| `ts:expense:split:cents` | Custom cents mode |
| `ts:expense:split:pct` | Custom percent mode |
| `ts:expense:post` | Commit expense |
| `ts:expense:back` | Previous wizard step |
| `ts:expense:cancel` | Cancel wizard |
| `ts:balances:suggested` | Show suggested |
| `ts:suggested:settle:<n>` | Start settlement #n |
| `ts:suggested:refresh` | Recompute |
| `ts:settle:paid:<id>` | Payer confirms payment |
| `ts:settle:confirm:<id>` | Payee confirms receipt |
| `ts:settle:dispute:<id>` | Payee disputes |
| `ts:settle:cancel:<id>` | Cancel settlement |

---

## HARNESS NOTES

- `makeBot()` must be the sole export used by the test harness.
- Session storage defaults to in-memory under harness; PostgreSQL in prod.
- Settlement expiry sweep is **not** started when `process.env.HARNESS === "1"` or when `require.main !== module`.
- DM-only callbacks (`settle:confirm`, `settle:dispute`) are exercised in BotSpec via private-chat steps in the Tests phase.