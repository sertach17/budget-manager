// Run with: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetDataFromRows, plaidGroup, type TransactionRow } from "./from-db.ts";
import { summarizeMonth } from "./summary.ts";

const row = (over: Partial<TransactionRow>): TransactionRow => ({
  id: "t1",
  account_id: "a1",
  category_id: null,
  posted_on: "2026-11-10",
  description: "SOMETHING",
  merchant: null,
  amount: -10,
  pending: false,
  plaid_category: null,
  ...over,
});

const checking = { id: "a1", name: "Checking", institution: "Chase", type: "checking", mask: "7682", current_balance: "1500.25" };
const card = { id: "a2", name: "Card", institution: "Chase", type: "credit", mask: "1111", current_balance: "300" };

test("Plaid's detailed categories map to their top level", () => {
  assert.equal(plaidGroup("FOOD_AND_DRINK_GROCERIES"), "FOOD_AND_DRINK");
  assert.equal(plaidGroup("TRANSFER_IN_ACCOUNT_TRANSFER"), "TRANSFER_IN");
  assert.equal(plaidGroup("LOAN_PAYMENTS_CREDIT_CARD_PAYMENT"), "LOAN_PAYMENTS");
  assert.equal(plaidGroup("INCOME_WAGES"), "INCOME");
  assert.equal(plaidGroup("SOMETHING_NEW"), null);
  assert.equal(plaidGroup(null), null);
});

test("real rows summarize: spending, income, transfers left out, net worth", () => {
  const data = budgetDataFromRows({
    accounts: [checking, card],
    categories: [],
    budgets: [],
    transactions: [
      row({ id: "t1", amount: "-54.20", plaid_category: "FOOD_AND_DRINK_GROCERIES", merchant: "Stop & Shop" }),
      row({ id: "t2", amount: "-20.00", plaid_category: "FOOD_AND_DRINK_RESTAURANT" }),
      row({ id: "t3", amount: "2100.00", plaid_category: "INCOME_WAGES" }),
      row({ id: "t4", amount: "-300.00", plaid_category: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
      row({ id: "t5", account_id: "a2", amount: "300.00", plaid_category: "TRANSFER_IN_ACCOUNT_TRANSFER" }),
      row({ id: "t9", amount: "-243.57", plaid_category: "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT" }),
      row({ id: "t6", amount: "-15.00" }), // Venmo email row: no Plaid category
      row({ id: "t7", amount: "25.00" }),
      row({ id: "t8", account_id: "hidden", amount: "-999" }),
    ],
  });
  const s = summarizeMonth(data, "2026-11-15");
  assert.equal(s.spent, 332.77);
  assert.equal(s.income, 2125);
  assert.equal(s.netWorth, 1200.25);
  assert.deepEqual(
    s.byCategory.map((c) => [c.category.name, c.spent]),
    [
      ["Loan payments", 243.57],
      ["Food and drink", 74.2],
      ["Uncategorized", 15],
    ],
  );
  assert.equal(data.transactions.find((t) => t.id === "t1")?.description, "Stop & Shop");
  assert.equal(data.transactions.some((t) => t.id === "t8"), false);
});

test("your own category wins over Plaid's", () => {
  const data = budgetDataFromRows({
    accounts: [checking],
    categories: [{ id: "c1", name: "Groceries", group_name: null, kind: "expense", color: "#16a34a", is_excluded: false }],
    budgets: [{ category_id: "c1", amount: "600" }],
    transactions: [row({ category_id: "c1", amount: "-40", plaid_category: "FOOD_AND_DRINK_GROCERIES" })],
  });
  const s = summarizeMonth(data, "2026-11-15");
  assert.deepEqual(s.byCategory.map((c) => [c.category.name, c.spent, c.budget]), [["Groceries", 40, 600]]);
});

test("your categories pick up bank categories you listed, detailed first", () => {
  const data = budgetDataFromRows({
    accounts: [checking],
    categories: [
      { id: "food", name: "Restaurants", group_name: null, kind: "expense", color: null, is_excluded: false, plaid_categories: ["FOOD_AND_DRINK"] },
      { id: "groc", name: "Groceries", group_name: null, kind: "expense", color: null, is_excluded: false, plaid_categories: ["FOOD_AND_DRINK_GROCERIES"] },
    ],
    budgets: [],
    transactions: [
      row({ id: "a", amount: "-30", plaid_category: "FOOD_AND_DRINK_GROCERIES" }),
      row({ id: "b", amount: "-12", plaid_category: "FOOD_AND_DRINK_FAST_FOOD" }),
      row({ id: "c", amount: "-5", plaid_category: "ENTERTAINMENT_MUSIC_AND_AUDIO" }),
    ],
  });
  const s = summarizeMonth(data, "2026-11-15");
  assert.deepEqual(
    s.byCategory.map((c) => [c.category.name, c.spent]),
    [
      ["Groceries", 30],
      ["Restaurants", 12],
      ["Entertainment", 5],
    ],
  );
});

test("spending adds up day by day, and unreviewed rows wait for review, newest first", () => {
  const data = budgetDataFromRows({
    accounts: [checking],
    categories: [{ id: "c1", name: "Groceries", group_name: null, kind: "expense", color: "#16a34a", is_excluded: false }],
    budgets: [],
    transactions: [
      row({ id: "t1", category_id: "c1", posted_on: "2026-11-01", amount: "-40", reviewed_at: null }),
      row({ id: "t2", category_id: "c1", posted_on: "2026-11-03", amount: "-10", reviewed_at: "2026-11-03T12:00:00Z" }),
      row({ id: "t3", category_id: "c1", posted_on: "2026-11-03", amount: "5" }), // refund
      row({ id: "t4", posted_on: "2026-11-04", amount: "900", plaid_category: "INCOME_WAGES", reviewed_at: null }),
      row({ id: "t5", posted_on: "2026-11-04", amount: "-60", plaid_category: "TRANSFER_OUT_ACCOUNT_TRANSFER" }),
    ],
  });
  const s = summarizeMonth(data, "2026-11-04");
  assert.deepEqual(s.spentByDay, [40, 40, 45, 45]);
  // t3 and t5 have no reviewed_at at all (an older query), so they count as reviewed.
  assert.deepEqual(
    s.toReview.map((t) => t.id),
    ["t4", "t1"],
  );
});

test("with your own Other category, unmatched spending goes there, not to bank-made categories", () => {
  const data = budgetDataFromRows({
    accounts: [checking],
    categories: [
      { id: "c1", name: "Other", group_name: null, kind: "expense", color: "#6b7280", is_excluded: false },
      { id: "c2", name: "Mortgage ", group_name: null, kind: "expense", color: "#000", is_excluded: false, plaid_categories: ["LOAN_PAYMENTS_MORTGAGE_PAYMENT"] },
    ],
    budgets: [],
    transactions: [
      row({ id: "t1", amount: "-2656", plaid_category: "LOAN_PAYMENTS_MORTGAGE_PAYMENT" }),
      row({ id: "t2", amount: "-243.57", plaid_category: "LOAN_PAYMENTS_PERSONAL_LOAN_PAYMENT" }),
      row({ id: "t3", amount: "-15" }), // no bank category
      row({ id: "t4", amount: "-300", plaid_category: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
      row({ id: "t5", amount: "2100", plaid_category: "INCOME_WAGES" }),
    ],
  });
  const s = summarizeMonth(data, "2026-11-15");
  assert.deepEqual(
    s.byCategory.map((c) => [c.category.name, c.spent]),
    [
      ["Mortgage ", 2656],
      ["Other", 258.57],
    ],
  );
  assert.equal(s.income, 2100);
});

test("bank transfers go to your own transfer category, which isn't spending", () => {
  const data = budgetDataFromRows({
    accounts: [checking],
    categories: [
      { id: "other", name: "Other", group_name: null, kind: "expense", color: null, is_excluded: false },
      { id: "move", name: "Transfers", group_name: null, kind: "transfer", color: null, is_excluded: false },
    ],
    budgets: [{ category_id: "other", amount: "100" }],
    transactions: [
      row({ id: "a", amount: "-173.64", plaid_category: "TRANSFER_OUT_ACCOUNT_TRANSFER" }),
      row({ id: "b", amount: "-500", plaid_category: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
      row({ id: "c", amount: "-20", plaid_category: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE" }),
    ],
  });
  assert.equal(data.transactions.find((t) => t.id === "a")?.categoryId, "move");
  assert.equal(data.transactions.find((t) => t.id === "b")?.categoryId, "move");
  const s = summarizeMonth(data, "2026-11-15");
  assert.equal(s.spent, 20);
  assert.deepEqual(s.byCategory.map((c) => c.category.name), ["Other"]);
});
