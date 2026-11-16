// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { readGoal, type GoalInput } from "./goal-input.ts";

const base: GoalInput = { name: " Summer  vacation ", target: "$6,000", targetDate: "2027-01-31", accountId: "acc", from: "part", amount: "2,350" };

test("reads part of an account", () => {
  assert.deepEqual(readGoal(base), { name: "Summer vacation", target: 6000, targetDate: "2027-01-31", accountId: "acc", setAside: 2350 });
});

test("all of an account has no set-aside amount", () => {
  assert.equal((readGoal({ ...base, from: "all", amount: "" }) as { setAside: null }).setAside, null);
});

test("no account keeps what you saved by hand, or 0", () => {
  assert.equal((readGoal({ ...base, accountId: "", amount: "" }) as { setAside: number }).setAside, 0);
  assert.equal((readGoal({ ...base, accountId: "", from: "all", amount: "300" }) as { setAside: number }).setAside, 300);
});

test("rejects a missing name, target or part amount", () => {
  assert.equal(typeof readGoal({ ...base, name: " " }), "string");
  assert.equal(typeof readGoal({ ...base, target: "0" }), "string");
  assert.equal(typeof readGoal({ ...base, amount: "" }), "string");
  assert.equal(typeof readGoal({ ...base, targetDate: "soon" }), "string");
});
