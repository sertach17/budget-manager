// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeFilterCount,
  applyTransactionFilters,
  DEFAULT_FILTERS,
  filtersToSearch,
  likePattern,
  readFilters,
  searchAmount,
} from "./filter-transactions.ts";
import type { Account, Transaction } from "./types.ts";

const account = (id: string): Account => ({ id, name: id, institution: null, type: "checking", mask: null, currentBalance: 0 });
const data = { accounts: [account("a"), account("b")] };
const tx = (over: Partial<Transaction>): Transaction => ({
  id: "t",
  accountId: "a",
  categoryId: "food",
  postedOn: "2026-11-20",
  description: "x",
  merchant: null,
  amount: -10,
  pending: false,
  ...over,
});

const rows = [
  tx({ id: "1", description: "Blue Bottle Coffee", amount: -4.5, postedOn: "2026-11-21" }),
  tx({ id: "2", description: "Payroll", amount: 2100, categoryId: "pay", postedOn: "2026-11-20", reviewed: false }),
  tx({ id: "3", description: "amazon", merchant: "Amazon Marketplace", amount: -62.18, accountId: "b", postedOn: "2026-11-19" }),
  tx({ id: "4", description: "Stop & Shop", amount: -12.5, postedOn: "2026-11-01", reviewed: false }),
];
const ids = (list: Transaction[]) => list.map((t) => t.id);
const run = (over: Partial<typeof DEFAULT_FILTERS>) => ids(applyTransactionFilters(data, rows, { ...DEFAULT_FILTERS, ...over }));

test("with nothing chosen every row shows, newest first", () => {
  assert.deepEqual(run({}), ["1", "2", "3", "4"]);
});

test("search matches the name or the merchant, ignoring case", () => {
  assert.deepEqual(run({ q: "coffee" }), ["1"]);
  assert.deepEqual(run({ q: "marketplace" }), ["3"]);
});

test("search matches an exact amount, in or out, with or without a dollar sign", () => {
  assert.deepEqual(run({ q: "12.50" }), ["4"]);
  assert.deepEqual(run({ q: "$2,100" }), ["2"]);
  assert.deepEqual(run({ q: "-4.5" }), ["1"]);
  assert.equal(searchAmount("coffee"), null);
});

test("filters by account, category, review status and dates", () => {
  assert.deepEqual(run({ account: "b" }), ["3"]);
  assert.deepEqual(run({ category: "pay" }), ["2"]);
  assert.deepEqual(run({ status: "review" }), ["2", "4"]);
  assert.deepEqual(run({ status: "reviewed" }), ["1", "3"]);
  assert.deepEqual(run({ from: "2026-11-19", to: "2026-11-20" }), ["2", "3"]);
});

test("sorts by date, size of the amount and name", () => {
  assert.deepEqual(run({ sort: "oldest" }), ["4", "3", "2", "1"]);
  assert.deepEqual(run({ sort: "largest" }), ["2", "3", "4", "1"]);
  assert.deepEqual(run({ sort: "smallest" }), ["1", "4", "3", "2"]);
  assert.deepEqual(run({ sort: "name" }), ["3", "1", "2", "4"]);
});

test("rows from accounts not shown are left out", () => {
  const list = applyTransactionFilters({ accounts: [account("a")] }, rows, DEFAULT_FILTERS);
  assert.deepEqual(ids(list), ["1", "2", "4"]);
});

test("the page address round-trips and drops bad values", () => {
  const f = readFilters(new URLSearchParams("q=+coffee+&sort=largest&status=review&from=2026-11-01&to=nope&account=b"));
  assert.deepEqual(f, { ...DEFAULT_FILTERS, q: "coffee", sort: "largest", status: "review", from: "2026-11-01", account: "b" });
  assert.equal(filtersToSearch(f), "?q=coffee&sort=largest&account=b&status=review&from=2026-11-01");
  assert.equal(filtersToSearch(DEFAULT_FILTERS), "");
  assert.equal(readFilters({ sort: "sideways", status: ["reviewed", "all"] }).sort, "newest");
  assert.equal(readFilters({ status: ["reviewed", "all"] }).status, "reviewed");
  assert.equal(activeFilterCount(f), 3);
});

test("a search is made safe for the database filter", () => {
  assert.equal(likePattern('50% off "deal"\\'), "%50_ off _deal__%");
});
