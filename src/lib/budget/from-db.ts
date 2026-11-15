import type { Account, AccountType, Budget, BudgetData, Category, CategoryKind, Transaction } from "./types";

// Turns database rows into the shapes DashboardView uses.
//
// A transaction with no category_id goes to the category of yours whose
// plaid_categories list names its Plaid category. If none does, it's grouped
// by Plaid's own category (plaid_category holds Plaid's
// detailed name, like FOOD_AND_DRINK_GROCERIES). Transfers between your own
// accounts and card payments count as transfers, so they aren't spending.

export type AccountRow = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  mask: string | null;
  current_balance: number | string | null;
};

export type TransactionRow = {
  id: string;
  account_id: string;
  category_id: string | null;
  posted_on: string;
  description: string;
  merchant: string | null;
  amount: number | string;
  pending: boolean;
  plaid_category: string | null;
};

export type CategoryRow = {
  id: string;
  name: string;
  group_name: string | null;
  kind: string;
  color: string | null;
  is_excluded: boolean;
  plaid_categories?: string[] | null;
};

export type BudgetRow = {
  category_id: string;
  amount: number | string;
};

type Fallback = { name: string; kind: CategoryKind; color: string; excluded?: boolean };

// Plaid's top-level categories, in Plaid's words made plain.
const PLAID_GROUPS: Record<string, Fallback> = {
  INCOME: { name: "Income", kind: "income", color: "#059669" },
  TRANSFER_IN: { name: "Transfers", kind: "transfer", color: "#6b7280", excluded: true },
  TRANSFER_OUT: { name: "Transfers", kind: "transfer", color: "#6b7280", excluded: true },
  // Mortgage, car and other loan payments are real spending; card payments
  // are not (the card's purchases already counted), see DETAILED below.
  LOAN_PAYMENTS: { name: "Loan payments", kind: "expense", color: "#4f46e5" },
  LOAN_DISBURSEMENTS: { name: "Transfers", kind: "transfer", color: "#6b7280", excluded: true },
  BANK_FEES: { name: "Bank fees", kind: "expense", color: "#b91c1c" },
  ENTERTAINMENT: { name: "Entertainment", kind: "expense", color: "#e11d48" },
  FOOD_AND_DRINK: { name: "Food and drink", kind: "expense", color: "#ea580c" },
  GENERAL_MERCHANDISE: { name: "Shopping", kind: "expense", color: "#9333ea" },
  HOME_IMPROVEMENT: { name: "Home improvement", kind: "expense", color: "#7c3aed" },
  MEDICAL: { name: "Medical", kind: "expense", color: "#0891b2" },
  PERSONAL_CARE: { name: "Personal care", kind: "expense", color: "#db2777" },
  GENERAL_SERVICES: { name: "Services", kind: "expense", color: "#2563eb" },
  GOVERNMENT_AND_NON_PROFIT: { name: "Government and donations", kind: "expense", color: "#4b5563" },
  TRANSPORTATION: { name: "Transportation", kind: "expense", color: "#ca8a04" },
  TRAVEL: { name: "Travel", kind: "expense", color: "#0d9488" },
  RENT_AND_UTILITIES: { name: "Rent and utilities", kind: "expense", color: "#16a34a" },
};

// Detailed categories that don't follow their top level.
const DETAILED: Record<string, Fallback> = {
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: { name: "Transfers", kind: "transfer", color: "#6b7280", excluded: true },
};

const UNCATEGORIZED: Category = {
  id: "fallback:uncategorized",
  name: "Uncategorized",
  groupName: null,
  kind: "expense",
  color: "#9ca3af",
  isExcluded: false,
};

const OTHER_INCOME: Category = {
  id: "fallback:other-income",
  name: "Other money in",
  groupName: null,
  kind: "income",
  color: "#10b981",
  isExcluded: false,
};

const ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "credit", "cash", "investment", "loan", "other"];
const KINDS: CategoryKind[] = ["expense", "income", "transfer"];

const num = (value: number | string | null) => (value === null ? 0 : Number(value));

// Plaid's top-level category for a detailed one, or null if it isn't known.
export function plaidGroup(detailed: string | null): string | null {
  if (!detailed) return null;
  // Longest match first, so TRANSFER_IN isn't read as some shorter name.
  const match = Object.keys(PLAID_GROUPS)
    .sort((a, b) => b.length - a.length)
    .find((group) => detailed === group || detailed.startsWith(`${group}_`));
  return match ?? null;
}

function fallbackCategory(t: TransactionRow): Category {
  const group = plaidGroup(t.plaid_category);
  const f = (t.plaid_category && DETAILED[t.plaid_category]) || (group ? PLAID_GROUPS[group] : null);
  if (f) {
    // Transfer rows and card payments share one "Transfers" bucket.
    const id = `fallback:${f.name.toLowerCase().replace(/[^a-z]+/g, "-")}`;
    return { id, name: f.name, groupName: null, kind: f.kind, color: f.color, isExcluded: f.excluded ?? false };
  }
  return num(t.amount) > 0 ? OTHER_INCOME : UNCATEGORIZED;
}

export function budgetDataFromRows(rows: {
  accounts: AccountRow[];
  transactions: TransactionRow[];
  categories: CategoryRow[];
  budgets: BudgetRow[];
}): BudgetData {
  const accounts: Account[] = rows.accounts.map((a) => ({
    id: a.id,
    name: a.name,
    institution: a.institution,
    type: ACCOUNT_TYPES.includes(a.type as AccountType) ? (a.type as AccountType) : "other",
    mask: a.mask,
    currentBalance: num(a.current_balance),
  }));

  const categories = new Map<string, Category>();
  for (const c of rows.categories) {
    categories.set(c.id, {
      id: c.id,
      name: c.name,
      groupName: c.group_name,
      kind: KINDS.includes(c.kind as CategoryKind) ? (c.kind as CategoryKind) : "expense",
      color: c.color ?? "#6b7280",
      isExcluded: c.is_excluded,
    });
  }

  // Your categories' bank-category lists: detailed names win over top-level.
  const byPlaidName = new Map<string, string>();
  for (const c of rows.categories) {
    for (const name of c.plaid_categories ?? []) {
      if (!byPlaidName.has(name)) byPlaidName.set(name, c.id);
    }
  }
  const yourCategoryFor = (detailed: string | null) => {
    if (!detailed) return null;
    const group = plaidGroup(detailed);
    return byPlaidName.get(detailed) ?? (group ? byPlaidName.get(group) : undefined) ?? null;
  };

  const accountIds = new Set(accounts.map((a) => a.id));
  const transactions: Transaction[] = [];
  for (const t of rows.transactions) {
    // Rows from hidden accounts are left out with the account.
    if (!accountIds.has(t.account_id)) continue;
    let categoryId = t.category_id && categories.has(t.category_id) ? t.category_id : yourCategoryFor(t.plaid_category);
    if (!categoryId) {
      const fallback = fallbackCategory(t);
      if (!categories.has(fallback.id)) categories.set(fallback.id, fallback);
      categoryId = fallback.id;
    }
    transactions.push({
      id: t.id,
      accountId: t.account_id,
      categoryId,
      postedOn: t.posted_on,
      description: t.merchant || t.description,
      merchant: t.merchant,
      amount: num(t.amount),
      pending: t.pending,
    });
  }

  const budgets: Budget[] = rows.budgets.map((b) => ({ categoryId: b.category_id, amount: num(b.amount) }));

  return { accounts, categories: [...categories.values()], transactions, budgets };
}
