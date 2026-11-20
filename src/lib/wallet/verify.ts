import { createHmac, timingSafeEqual } from "node:crypto";

// Checks a WalletFeed post. WalletFeed signs every post the Standard
// Webhooks way: an HMAC-SHA256 of "<webhook-id>.<webhook-timestamp>.<body>"
// with your signing secret, sent as "v1,<base64>" in webhook-signature.
// A post more than 5 minutes old or early is refused, so an old one
// copied by someone can't be sent again later.

const TOLERANCE_SECONDS = 5 * 60;

export const SECRET_PATTERN = /^whsec_[A-Za-z0-9+/=]{16,200}$/;

// The secret's key bytes, or null when it isn't a WalletFeed secret.
export function secretKey(secret: string): Buffer | null {
  if (!SECRET_PATTERN.test(secret)) return null;
  const key = Buffer.from(secret.slice("whsec_".length), "base64");
  return key.length >= 16 ? key : null;
}

export type Verdict = { ok: true } | { ok: false; reason: string };

export function verifyWalletPost(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: Buffer;
  now?: Date;
}): Verdict {
  const key = secretKey(input.secret);
  if (!key) return { ok: false, reason: "The saved signing secret isn't a WalletFeed secret" };
  if (!input.id || !input.timestamp || !input.signature) return { ok: false, reason: "Missing signature headers" };
  if (!/^\d{1,12}$/.test(input.timestamp)) return { ok: false, reason: "Bad timestamp" };

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - Number(input.timestamp)) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp more than 5 minutes off" };
  }

  const expected = createHmac("sha256", key)
    .update(`${input.id}.${input.timestamp}.`)
    .update(input.body)
    .digest();

  // Several signatures may be sent, space-separated, while a secret is
  // being replaced. One match is enough.
  for (const entry of input.signature.split(" ")) {
    const [version, value] = entry.split(",", 2);
    if (version !== "v1" || !value) continue;
    const given = Buffer.from(value, "base64");
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true };
  }
  return { ok: false, reason: "Signature doesn't match" };
}
