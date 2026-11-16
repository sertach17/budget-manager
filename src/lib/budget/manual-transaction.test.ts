// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { readManualTransaction } from "./manual-transaction.ts";

const today = "2026-11-16";

test("a typed purchase is money out, a typed payment is money in", () => {
  assert.deepEqual(
    readManualTransaction({ postedOn: "2026-11-15", description: "  Corner   Store ", amount: "$1,012.505", direction: "out", categoryId: "" }, today),
    { postedOn: "2026-11-15", description: "Corner Store", amount: -1012.51, categoryId: "" },
  );
  const paid = readManualTransaction({ postedOn: today, description: "Refund", amount: "-20", direction: "in", categoryId: "c1" }, today);
  assert.equal(typeof paid === "string" ? paid : paid.amount, 20);
});

test("says what's missing", () => {
  const base = { postedOn: today, description: "Store", amount: "5", direction: "out" as const, categoryId: "" };
  assert.equal(readManualTransaction({ ...base, postedOn: "" }, today), "Pick the date.");
  assert.equal(readManualTransaction({ ...base, postedOn: "2026-11-17" }, today), "The date can't be in the future.");
  assert.equal(readManualTransaction({ ...base, description: " " }, today), "Type what it was, like Corner Store.");
  assert.equal(readManualTransaction({ ...base, amount: "abc" }, today), "Type the amount as a number, like 12.50.");
  assert.equal(readManualTransaction({ ...base, amount: "0" }, today), "Type the amount as a number, like 12.50.");
});
