// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { goalProgress, monthsLeft } from "./goals.ts";
import type { Account, Goal, Transaction } from "./types.ts";

const savings: Account = { id: "s", name: "Savings", institution: null, type: "savings", mask: null, currentBalance: 6800 };
const vacation: Goal = { id: "g1", name: "Vacation", target: 6000, targetDate: "2027-01-31", accountId: "s", setAside: 2350 };
const tx = (over: Partial<Transaction>): Transaction => ({
  id: "t",
  accountId: "s",
  categoryId: null,
  postedOn: "2026-11-16",
  description: "x",
  merchant: null,
  amount: 0,
  pending: false,
  ...over,
});

test("a set-aside amount plus a tagged deposit counts the deposit once", () => {
  const data = { accounts: [savings], transactions: [tx({ id: "a", amount: 200, goalId: "g1" })], goals: [vacation] };
  const p = goalProgress(vacation, data, "2026-11-16");
  assert.equal(p.fromAccount, 2350);
  assert.equal(p.tagged, 200);
  assert.equal(p.saved, 2550);
  assert.equal(p.left, 3450);
});

test("tagged spending takes from the goal and keeps its other transactions out", () => {
  const data = {
    accounts: [savings],
    transactions: [tx({ id: "a", amount: -450, goalId: "g1" }), tx({ id: "b", amount: -99 })],
    goals: [vacation],
  };
  assert.equal(goalProgress(vacation, data, "2026-11-16").saved, 1900);
});

test("all of the balance leaves out tagged transactions in that same account", () => {
  const whole = { ...vacation, setAside: null };
  const data = {
    accounts: [savings],
    transactions: [tx({ id: "a", amount: 200, goalId: "g1" }), tx({ id: "b", accountId: "c", amount: 50, goalId: "g1" })],
    goals: [whole],
  };
  const p = goalProgress(whole, data, "2026-11-16");
  assert.equal(p.fromAccount, 6800);
  assert.equal(p.tagged, 50);
  assert.equal(p.percent, 100);
  assert.equal(p.left, 0);
});

test("with no account the set-aside is what you saved by hand", () => {
  const laptop: Goal = { id: "g2", name: "Laptop", target: 1200, targetDate: null, accountId: null, setAside: 300 };
  const p = goalProgress(laptop, { accounts: [], transactions: [] }, "2026-11-16");
  assert.equal(p.saved, 300);
  assert.equal(p.perMonth, null);
  assert.equal(p.percent, 25);
});

test("monthly need splits what's left over the months to the date", () => {
  assert.equal(monthsLeft("2026-11-16", "2027-01-31"), 3);
  assert.equal(monthsLeft("2026-11-16", "2027-01-10"), 2);
  assert.equal(monthsLeft("2026-11-16", "2026-11-20"), 1);
  assert.equal(monthsLeft("2026-11-16", "2026-11-01"), 0);
  const p = goalProgress(vacation, { accounts: [savings], transactions: [], goals: [vacation] }, "2026-11-16");
  assert.equal(p.perMonth, 1216.67);
});

test("warns when goals set aside more than the account holds", () => {
  const other: Goal = { id: "g3", name: "Car", target: 9000, targetDate: null, accountId: "s", setAside: 5000 };
  const p = goalProgress(vacation, { accounts: [savings], transactions: [], goals: [vacation, other] }, "2026-11-16");
  assert.equal(p.shortBy, 550);
});
