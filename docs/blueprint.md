# TripSplit — Bot specification

**Archetype:** custom

**Voice:** friendly and helpful — write every user-facing message, button label, error, and empty state in this voice.

Telegram bot for tracking and settling group trip expenses in group chats. Records expenses with automatic balancing, handles participant joins/leaves, and suggests minimal settlement payments while keeping data private to trip participants.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Groups of friends/travel companions
- Non-technical users

## Success criteria

- Users can track expenses and settle debts with minimal steps
- Balances always sum to zero with deterministic rounding
- Private confirmations prevent accidental changes

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with trip options
  - outputs: Welcome message with /newtrip and /balance options
- **/newtrip** (command, actor: user, command: /newtrip) — Create new trip with name and currency
  - inputs: trip name, currency
  - outputs: Trip created confirmation with organizer privileges
- **/balance** (command, actor: user, command: /balance) — Show current balances and settlement suggestions
  - outputs: Net balances and minimal payment plan
- **/jointrip** (command, actor: user, command: /jointrip) — Request to join an active trip
  - outputs: Confirmation prompt for organizer
- **Record Expense** (button, actor: user, callback: expense:start) — Open expense recording interface
  - inputs: amount, payer, split type
  - outputs: Balance update message

## Flows

### Trip Creation
_Trigger:_ /newtrip

1. User initiates /newtrip command
2. Bot prompts for missing parameters
3. Trip is created with organizer and participants

_Data touched:_ Trip

### Expense Recording
_Trigger:_ expense:start

1. User selects 'Record Expense' button
2. Bot collects amount, payer, and split details
3. Expense is added with automatic balance calculation

_Data touched:_ Expense, Balance snapshot

### Settlement Recording
_Trigger:_ /paid

1. User marks debt as paid
2. Bot sends private confirmation
3. Settlement is recorded and balances updated

_Data touched:_ Settlement, Balance snapshot

### Trip Closure
_Trigger:_ close trip command

1. Organizer initiates closure
2. Final balances calculated
3. Private summary sent to organizer

_Data touched:_ Trip, Balance snapshot

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **Trip** _(retention: persistent)_ — Group trip metadata and participants
  - fields: id, name, currency, organizer, participants, status
- **Expense** _(retention: persistent)_ — Recorded expense with split details
  - fields: id, trip_id, amount, payer, participant_shares, timestamp
- **Balance snapshot** _(retention: session)_ — Current net balances per participant
  - fields: participant_id, net_balance
- **Settlement** _(retention: persistent)_ — Recorded payment between participants
  - fields: from, to, amount, timestamp
- **Audit log** _(retention: persistent)_ — Immutable change history
  - fields: action, actor, timestamp

## Integrations

- **Telegram** (required) — Group chat and private message interface
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Add/remove participants
- Close trips
- View full audit logs
- Request detailed expense breakdowns

## Notifications

- Group balance updates
- Private confirmation prompts
- Final trip summary to organizer

## Permissions & privacy

- Trip data visible only to participants
- Sensitive actions require private confirmations
- Organizer sees full audit trail

## Edge cases

- Mid-trip participant joins/leaves
- Fractional currency rounding
- Expense edits requiring balance recalculations

## Required tests

- End-to-end trip creation and closure flow
- Multi-participant expense with custom splits
- Settlement confirmation prevents balance overwrites

## Assumptions

- Default equal split unless specified
- Fixed currency per trip
- Rounding remainder distributed to largest fractions
