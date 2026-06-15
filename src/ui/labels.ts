/**
 * Button labels for reply-keyboard and inline-keyboard UI.
 * Users interact via taps — slash commands remain as fallbacks for the harness.
 */

export const MENU = {
  START_TRIP: "🚀 Start Trip",
  LOG_EXPENSE: "💰 Log Expense",
  BALANCES: "📊 Balances",
  SUGGESTED: "💸 Suggested",
  SETTLE: "✅ Settle",
  MEMBERS: "👥 Members",
  EXPORT: "📁 Export",
  HELP: "❓ Help",
} as const;

export type MenuLabel = (typeof MENU)[keyof typeof MENU];

export const ALL_MENU_LABELS: ReadonlySet<string> = new Set(Object.values(MENU));

/** Labels usable before a trip exists. */
export const PUBLIC_MENU_LABELS: ReadonlySet<string> = new Set([
  MENU.START_TRIP,
  MENU.HELP,
]);

export const HELP_TEXT = [
  "TripSplit — shared trip expenses",
  "",
  "Use the buttons below to:",
  "• Log Expense — record a shared cost",
  "• Balances — see who owes what",
  "• Suggested — minimal repayments",
  "• Settle — confirm a payment",
  "• Members — add or remove people",
  "• Export — audit CSV to your DM",
  "",
  "Tap 🚀 Start Trip to begin in a new group.",
].join("\n");