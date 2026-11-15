import "server-only";
import { PlaidClient, PlaidEnvironment } from "plaid";

export type PlaidEnv = "sandbox" | "production";

// Which Plaid to use. Test sites (Vercel previews) use Plaid's fake bank and
// the live site uses real banks, unless PLAID_ENV says otherwise.
export function plaidEnv(): PlaidEnv {
  const forced = process.env.PLAID_ENV;
  if (forced === "sandbox" || forced === "production") return forced;
  return process.env.VERCEL_ENV === "production" ? "production" : "sandbox";
}

export function isPlaidConfigured() {
  return Boolean(process.env.PLAID_CLIENT_ID && process.env.PLAID_SECRET);
}

export function plaidClient() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("Plaid keys are missing. Add PLAID_CLIENT_ID and PLAID_SECRET in Vercel.");
  }
  return new PlaidClient({
    environment: plaidEnv() === "production" ? PlaidEnvironment.Production : PlaidEnvironment.Sandbox,
    clientId,
    secret,
    timeoutInSeconds: 30,
  });
}

// Plaid's error code (like ITEM_LOGIN_REQUIRED) without anything sensitive.
export function plaidErrorCode(error: unknown): string {
  const body = (error as { body?: { error_code?: unknown } } | null)?.body;
  return typeof body?.error_code === "string" ? body.error_code : "UNKNOWN_ERROR";
}
