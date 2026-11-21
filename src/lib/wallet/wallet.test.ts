// Run with: npm test
// Posts are shaped like WalletFeed's documented samples (Nov 2026).
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { appBalance, bankCategory, readEnvelope, readEvent } from "./parse.ts";
import { secretKey, verifyWalletPost } from "./verify.ts";

const secret = "whsec_" + Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const now = new Date("2026-11-20T21:00:00Z");
const timestamp = String(Math.floor(now.getTime() / 1000));
const body = Buffer.from('{"id":"evt_1","type":"transaction.created"}');
const sign = (s: string, ts = timestamp, b = body) =>
  "v1," + createHmac("sha256", secretKey(s)!).update(`msg_1.${ts}.`).update(b).digest("base64");

test("a correctly signed post passes", () => {
  assert.deepEqual(verifyWalletPost({ secret, id: "msg_1", timestamp, signature: sign(secret), body, now }), { ok: true });
});

test("one matching signature among several is enough", () => {
  const other = "whsec_" + Buffer.from("another secret, sixteen+ bytes").toString("base64");
  const signature = `${sign(other)} ${sign(secret)}`;
  assert.equal(verifyWalletPost({ secret, id: "msg_1", timestamp, signature, body, now }).ok, true);
});

test("a changed body, wrong secret or old post fails", () => {
  const changed = Buffer.from('{"id":"evt_1","type":"transaction.deleted"}');
  assert.equal(verifyWalletPost({ secret, id: "msg_1", timestamp, signature: sign(secret), body: changed, now }).ok, false);
  const other = "whsec_" + Buffer.from("another secret, sixteen+ bytes").toString("base64");
  assert.equal(verifyWalletPost({ secret, id: "msg_1", timestamp, signature: sign(other), body, now }).ok, false);
  const old = String(Number(timestamp) - 301);
  assert.equal(verifyWalletPost({ secret, id: "msg_1", timestamp: old, signature: sign(secret, old), body, now }).ok, false);
  assert.equal(verifyWalletPost({ secret, id: "msg_1", timestamp, signature: null, body, now }).ok, false);
});

test("only WalletFeed-style secrets are accepted", () => {
  assert.equal(secretKey("not a secret"), null);
  assert.equal(secretKey("whsec_short"), null);
  assert.ok(secretKey(secret));
});

const purchase = {
  id: "evt_2",
  type: "transaction.created",
  version: 2,
  livemode: true,
  data: {
    id: "7d0c6b8e-0000-4000-8000-000000000001",
    account_id: "acc-apple-card",
    account_name: "Apple Card",
    account_type: "liability",
    amount: -42.18,
    direction: "debit",
    currency: "USD",
    status: "pending",
    type: "pointOfSale",
    description: "Trader Joe's",
    merchant_name: "Trader Joe's",
    category: "groceries",
    transacted_at: "2026-11-20T03:30:00Z", // Nov 19, 10:30 PM in New York
    posted_at: null,
    extra_field: "ignored",
  },
};

test("a pending Apple Card purchase", () => {
  const e = readEvent(readEnvelope(purchase)!);
  assert.deepEqual(e, {
    kind: "transactions",
    fromHistory: false,
    transactions: [
      {
        walletTransactionId: "7d0c6b8e-0000-4000-8000-000000000001",
        walletAccountId: "acc-apple-card",
        accountName: "Apple Card",
        accountType: "liability",
        postedOn: "2026-11-19",
        description: "Trader Joe's",
        merchant: "Trader Joe's",
        amount: -42.18,
        pending: true,
        bankCategory: "FOOD_AND_DRINK_GROCERIES",
      },
    ],
  });
});

test("Send Test is marked as a test", () => {
  assert.equal(readEnvelope({ ...purchase, livemode: false })!.test, true);
  assert.equal(readEnvelope(purchase)!.test, false);
  assert.equal(readEnvelope({ type: "x" }), null);
});

test("a card payment isn't spending, savings interest is income", () => {
  assert.equal(bankCategory({ type: "billPayment", category: null, amount: 500, accountType: "liability" }), "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
  assert.equal(bankCategory({ type: "transfer", category: null, amount: 500, accountType: "liability" }), "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT");
  assert.equal(bankCategory({ type: "transfer", category: "cash", amount: -20, accountType: "asset" }), "TRANSFER_OUT_ACCOUNT_TRANSFER");
  assert.equal(bankCategory({ type: "interest", category: null, amount: 3.1, accountType: "asset" }), "INCOME_INTEREST_EARNED");
  assert.equal(bankCategory({ type: "pointOfSale", category: "other", amount: -5, accountType: "asset" }), null);
  assert.equal(bankCategory({ type: "refund", category: "shopping", amount: 12, accountType: "liability" }), "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE");
});

test("a history batch keeps the good rows", () => {
  const e = readEvent(
    readEnvelope({
      id: "evt_3",
      type: "transaction.backfilled",
      livemode: true,
      data: { source: "history", has_more: false, transactions: [purchase.data, { id: "bad" }] },
    })!,
  );
  assert.equal(e.kind, "transactions");
  if (e.kind === "transactions") {
    assert.equal(e.fromHistory, true);
    assert.equal(e.transactions.length, 1);
  }
});

test("balances: owed on Apple Card is positive, savings stay as is", () => {
  assert.equal(appBalance("liability", -812.4), 812.4);
  assert.equal(appBalance("asset", 2350), 2350);
  const e = readEvent(
    readEnvelope({
      id: "evt_4",
      type: "balance.updated",
      livemode: true,
      data: { account_id: "acc-apple-card", account_name: "Apple Card", account_type: "liability", booked: { amount: -812.4, direction: "debit", as_of: "2026-11-20T20:00:00Z" }, available: null },
    })!,
  );
  assert.deepEqual(e, {
    kind: "balance",
    account: { walletAccountId: "acc-apple-card", name: "Apple Card", institution: null, accountType: "liability" },
    balance: 812.4,
    asOf: "2026-11-20T20:00:00Z",
  });
});

test("removals and unknown events", () => {
  assert.deepEqual(readEvent({ id: "e", type: "transaction.deleted", test: false, data: { id: "tx-1", reason: "rejected" } }), {
    kind: "deleted",
    walletTransactionId: "tx-1",
  });
  assert.equal(readEvent({ id: "e", type: "something.new", test: false, data: {} }).kind, "ignored");
});
