// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceChange, easternDay } from "./own-balance.ts";

test("a purchase lowers a bank balance and raises what a card owes", () => {
  const rows = [{ postedOn: "2026-11-17", amount: -50 }];
  assert.equal(balanceChange("cash", "2026-11-16", rows), -50);
  assert.equal(balanceChange("savings", "2026-11-16", rows), -50);
  assert.equal(balanceChange("credit", "2026-11-16", rows), 50);
});

test("a card payment or refund lowers what the card owes", () => {
  assert.equal(balanceChange("credit", "2026-11-16", [{ postedOn: "2026-11-18", amount: 120.5 }]), -120.5);
});

test("only transactions dated the day the balance was set or later count", () => {
  const rows = [
    { postedOn: "2026-11-15", amount: -10 },
    { postedOn: "2026-11-16", amount: -20 },
    { postedOn: "2026-11-17", amount: -30.1 },
    { postedOn: "2026-11-17", amount: 5 },
  ];
  assert.equal(balanceChange("checking", "2026-11-16", rows), -45.1);
  assert.equal(balanceChange("checking", null, rows), -55.1);
});

test("the day a balance was set is read in Eastern time", () => {
  assert.equal(easternDay("2026-11-17T03:30:00Z"), "2026-11-16");
  assert.equal(easternDay("2026-11-17T05:30:00Z"), "2026-11-17");
  assert.equal(easternDay(null), null);
});
