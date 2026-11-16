// How a connected bank is doing, in words, from its last sync.

// Plaid error codes that only you can fix, by signing in to your bank again.
const NEEDS_SIGN_IN = new Set([
  "ITEM_LOGIN_REQUIRED",
  "PENDING_EXPIRATION",
  "PENDING_DISCONNECT",
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "ACCESS_NOT_GRANTED",
  "NO_ACCOUNTS",
  "USER_PERMISSION_REVOKED",
]);

// A bank that hasn't synced in this long has missed at least one morning sync.
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export type BankStatus =
  | { kind: "ok" }
  | { kind: "sign-in"; message: string }
  | { kind: "failed"; message: string }
  | { kind: "stale"; message: string };

export function bankStatus(
  item: { institution_name: string | null; last_synced_at: string | null; last_error: string | null },
  now = Date.now(),
): BankStatus {
  const bank = item.institution_name ?? "Your bank";
  if (item.last_error && NEEDS_SIGN_IN.has(item.last_error)) {
    return { kind: "sign-in", message: `${bank} needs you to sign in again before it can sync.` };
  }
  if (item.last_error) return { kind: "failed", message: `${bank}'s last sync didn't work (${item.last_error}).` };
  if (!item.last_synced_at || now - new Date(item.last_synced_at).getTime() > STALE_AFTER_MS) {
    return { kind: "stale", message: `${bank} hasn't synced in over a day.` };
  }
  return { kind: "ok" };
}

export function needsSignIn(code: string | null) {
  return Boolean(code && NEEDS_SIGN_IN.has(code));
}
