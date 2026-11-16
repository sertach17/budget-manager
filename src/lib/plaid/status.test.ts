// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { bankStatus, needsSignIn } from "./status.ts";

const now = Date.parse("2026-11-16T15:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();

test("a bank that synced this morning is fine", () => {
  assert.equal(bankStatus({ institution_name: "Chase", last_synced_at: hoursAgo(4), last_error: null }, now).kind, "ok");
});

test("a bank that needs you to sign in says so", () => {
  const s = bankStatus({ institution_name: "Chase", last_synced_at: hoursAgo(30), last_error: "ITEM_LOGIN_REQUIRED" }, now);
  assert.equal(s.kind, "sign-in");
  assert.match("message" in s ? s.message : "", /Chase needs you to sign in again/);
  assert.equal(needsSignIn("PENDING_EXPIRATION"), true);
  assert.equal(needsSignIn("RATE_LIMIT_EXCEEDED"), false);
  assert.equal(needsSignIn(null), false);
});

test("any other error shows its code", () => {
  const s = bankStatus({ institution_name: "Wells Fargo", last_synced_at: hoursAgo(2), last_error: "INSTITUTION_DOWN" }, now);
  assert.equal(s.kind, "failed");
});

test("a bank that missed a morning sync is flagged", () => {
  assert.equal(bankStatus({ institution_name: null, last_synced_at: hoursAgo(40), last_error: null }, now).kind, "stale");
  assert.equal(bankStatus({ institution_name: null, last_synced_at: null, last_error: null }, now).kind, "stale");
});
