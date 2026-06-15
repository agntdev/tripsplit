# TripSplit

Telegram group bot to record, split, and manually settle shared trip expenses in USD cents. Immutable audit logs and double-confirmed settlements.

## Features

- **Button-only UX** — reply keyboard + inline buttons (no slash commands)
- **Log expenses** — even, custom cents, or custom percent splits
- **Balances** — on-demand ledger from expenses and cleared settlements
- **Suggested payments** — greedy debt simplification with quick-settle buttons
- **Settle** — payer confirms in group, payee confirms via DM
- **Export** — audit CSV delivered to your DM

## Quick start

```bash
npm install
npm run build
BOT_TOKEN=... npm start
```

For local development with auto-rebuild:

```bash
npm run dev
```

### Testing

```bash
npm test          # vitest: BotSpec gate + programmatic advanced tests
npm run test:gate # platform GATE verdict (tests/specs.json)
```

- **`tests/specs.json`** — declarative dialog specs ([telegram-test-specs](https://github.com/agntdev/skills))
- **`tests/*.test.ts`** — programmatic tests for settle DM flow, API failures, ledger ([telegram-test-advanced](https://github.com/agntdev/skills/pull/4))
- **`tests/commands.json`** — empty `[]` (button-only bot; no slash-command coverage)

## Environment

| Variable | Default | Description |
|---|---|---|
| `BOT_TOKEN` | — | Telegram bot token (required) |
| `BOT_USERNAME` | `tripsplit_dd75dd_bot` | Bot username for DM deep links (managed bot on agnt) |
| `SETTLEMENT_EXPIRY_DAYS` | `7` | Pending settlement timeout |
| `HARNESS` | — | Set to `1` to disable background jobs in tests |

## Architecture

- `makeBot()` — factory used by the test harness (`src/index.ts`)
- `storage/repository.ts` — in-memory store (swap for PostgreSQL in production)
- `flows/` — grammY routing for wizards and callbacks
- `actions/` — screen handlers and business orchestration
- `services/` — ledger, split, simplify, settle, export

## Docs

- `docs/general.md` — product requirements
- `docs/design.md` — architecture
- `docs/details.md` — screen specs and callback schema