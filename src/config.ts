/**
 * Static configuration and constants.
 * See docs/design.md §1.9 and docs/details.md.
 */

/** Days before an unconfirmed settlement expires. */
export const SETTLEMENT_EXPIRY_DAYS = Number(
  process.env.SETTLEMENT_EXPIRY_DAYS ?? 7,
);

/** Max expense description length (chars). */
export const MAX_DESCRIPTION_LENGTH = 200;

/** Callback data namespace prefix. */
export const CB_PREFIX = "ts:";