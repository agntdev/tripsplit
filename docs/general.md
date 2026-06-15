# TripSplit Bot — GENERAL Design Document

## Summary
TripSplit is a Telegram group bot that tracks and settles shared expenses for a single trip per group. It allows members to log immutable expense records (payer, amount in USD cents, description, participants, and shares), computes net balances, suggests minimal repayment sets, and facilitates manual settlements requiring dual confirmation (payer and payee). Designed for travelers and friends coordinating in Telegram groups, it ensures auditability, handles mid-trip membership changes, and maintains privacy by scoping data to group members. Settlements are tracked via user-initiated, double-confirmed transfers (no automatic on-chain payments).

---

## Core ENTITIES
- **Trip**: A single trip per Telegram group, initialized by an organizer. Contains metadata (group ID, creation timestamp).
- **Participant**: Telegram user ID + display name; linked to a trip. May be added/removed via commands.
- **Organizer**: User who created the trip; receives summaries and audit exports but has no exclusive permissions.
- **Expense**: Immutable record of a payment (payer, amount in cents, description, timestamp, participant list, and per-participant shares). Shares sum to the expense amount via rounding rules.
- **Share Record**: Per-expense mapping of participant → owed amount (cents). Includes payer’s adjusted share for rounding.
- **Balance Snapshot**: Computed net balance per participant (total owed/owed to others). Not stored persistently except for caching/audit.
- **Suggested Payment**: Ephemeral record of a minimal repayment pair (e.g., "Alice pays Bob $15") derived from net balances.
- **Settlement Record**: Tracks pending/confirmed settlements (payer, payee, amount, timestamps for confirmation, and clearing status).

---

## External DEPENDENCIES
- **Telegram Bot API**:  
  - Group message handling (commands, inline keyboards).  
  - Direct message (DM) notifications for settlements and organizer summaries.  
  - User ID resolution for participants.  
- **Persistence**:  
  - PostgreSQL for storing trips, participants, expenses, shares, settlements, and audit logs.  
  - Optional file backups (CSV exports for organizers).  
- **No External APIs**:  
  - No payment processors (TON on-chain or fiat).  
  - No third-party services for currency conversion or user authentication.  

---

## FULL Feature List
- **Trip Initialization**:  
  - `/init_trip` creates a trip for the group; the issuer becomes the organizer.  
  - Automatically populates participants from current group members.  
- **Membership Management**:  
  - `/add @user` and `/remove @user` to modify participants (any current participant can execute).  
  - Removed participants retain liability for past shares until settled.  
  - New participants do not inherit claims to past expenses unless explicitly added via corrective entries.  
- **Expense Logging**:  
  - `/expense <amount> [description]` triggers an interactive form to select payer, participants, and split type (even or custom).  
  - Custom splits accept per-person cents or percentages (validated to sum to the expense amount; remainder applied to payer’s share).  
  - Even splits distribute amounts with rounding adjustments to payer’s share to ensure net-zero.  
  - Expenses are immutable; corrections require new entries (e.g., negative adjustments).  
  - Announces new expenses in-group with summaries and updated balances.  
- **Balance Tracking**:  
  - `/balances` or inline button displays each participant’s net balance (positive = owed money, negative = owes).  
  - Balances are computed on-demand from all expenses and settlements.  
- **Debt Simplification**:  
  - `/suggested` or inline button shows the minimal repayment set using a greedy algorithm (pair largest creditor with largest debtor).  
  - Suggested payments are ephemeral and not persisted until a settlement is initiated.  
- **Manual Settlements**:  
  - `/settle @payee <amount>` initiates a settlement request.  
  - Payer confirms via "I paid" button (group or DM).  
  - Payee receives a DM with "Confirm receipt" button; settlement is cleared only after both confirmations.  
  - Settlements expire if unconfirmed for 7 days (configurable).  
- **Organizer Tools**:  
  - `/trip_summary` provides a full audit of expenses, shares, settlements, and balances in CSV format via DM.  
  - Organizer receives one-tap summaries of pending settlements and balances.  
- **Audit & Immutability**:  
  - All expenses and settlements are stored as immutable records.  
  - Rounding logic ensures total shares equal the expense amount (payer absorbs remainder).  
  - Audit logs track all changes (e.g., participant additions/removals, settlements).  

---

## Non-Goals
- **No On-Chain Payments**: TON or other blockchain integrations are excluded.  
- **No Multi-Currency**: All amounts are in USD (cents precision).  
- **No Forced Settlements**: The bot does not auto-clear pending settlements or enforce unilateral changes.  
- **No Group-to-Multi-Trip Support**: Each Telegram group maps to exactly one trip.  
- **No External Wallet Integration**: No storage or handling of payment credentials.  

---

## Security & Privacy
- **Data Scoping**: Trip data is private to group members; non-participants cannot access balances or settlements.  
- **Double Confirmation**: Settlements require payer and payee to confirm via DM to prevent unilateral clearing.  
- **Immutability**: Expenses and settlements cannot be deleted; corrections must be new entries to preserve audit trails.  
- **User Authentication**: Actions are tied to Telegram user IDs; DM confirmations require users to initiate a private chat with the bot.  

---

## Edge Case Handling
- **Mid-Trip Joins/Exits**:  
  - New participants are not retroactively added to past expenses unless corrected via new entries.  
  - Removed participants remain liable for past shares until settlements are confirmed.  
- **Rounding Conflicts**:  
  - Remainder from even splits or percentage-based splits is applied to the payer’s share to ensure total shares match the expense amount.  
- **Disputes**:  
  - Pending settlements remain active until both parties confirm or the organizer exports data for manual resolution.