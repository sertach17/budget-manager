import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { budgetDataFromRows, type TransactionRow } from "@/lib/budget/from-db";
import type { BudgetData, Transaction } from "@/lib/budget/types";

// Reads for the agent tools. Each one runs with the agent's own token, so
// row-level security limits it to your rows, the same as the website.

export const TRANSACTION_COLUMNS =
  "id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category, reviewed_at, goal_id";
const ACCOUNT_COLUMNS = "id, name, institution, type, mask, current_balance";
const CATEGORY_COLUMNS = "id, name, group_name, kind, color, is_excluded, plaid_categories";
const GOAL_COLUMNS = "id, name, target_amount, target_date, account_id, set_aside";

export class ReadError extends Error {}

function check<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) {
    console.error(`Agent read of ${what} failed:`, result.error.message);
    throw new ReadError(`Couldn't read ${what}. Try again.`);
  }
  return result.data as T;
}

// First and last day of a month like 2026-11.
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

// Everything the budget math needs for one month, plus any transactions you
// pass in, with categories worked out the same way the website does.
export async function loadBudgetData(
  supabase: SupabaseClient,
  opts: { month?: string; transactions?: TransactionRow[]; withGoals?: boolean; withBudgets?: boolean } = {},
): Promise<BudgetData> {
  const range = opts.month ? monthRange(opts.month) : null;
  const [accounts, categories, budgets, goals, monthRows, tagged] = await Promise.all([
    supabase.from("accounts").select(ACCOUNT_COLUMNS).eq("is_hidden", false).order("institution").order("name"),
    supabase.from("categories").select(CATEGORY_COLUMNS).order("name"),
    opts.withBudgets && range
      ? supabase.from("budgets").select("category_id, amount, month").or(`month.is.null,month.eq.${range.start}`)
      : Promise.resolve({ data: [], error: null }),
    opts.withGoals ? supabase.from("goals").select(GOAL_COLUMNS).order("created_at") : Promise.resolve({ data: [], error: null }),
    range
      ? supabase.from("transactions").select(TRANSACTION_COLUMNS).gte("posted_on", range.start).lte("posted_on", range.end).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    opts.withGoals
      ? supabase.from("transactions").select(TRANSACTION_COLUMNS).not("goal_id", "is", null).limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  // A budget for this month wins over the every-month one.
  const budgetRows = [...check(budgets, "budgets")].sort((a, b) => (a.month === null ? -1 : 0) - (b.month === null ? -1 : 0));
  const byCategory = new Map(budgetRows.map((b) => [b.category_id, b]));

  const rows = new Map<string, TransactionRow>();
  for (const t of [...check(monthRows, "transactions"), ...check(tagged, "transactions"), ...(opts.transactions ?? [])]) {
    rows.set(t.id, t);
  }

  return budgetDataFromRows({
    accounts: check(accounts, "accounts"),
    categories: check(categories, "categories"),
    budgets: [...byCategory.values()],
    goals: check(goals, "goals"),
    transactions: [...rows.values()],
  });
}

// One transaction the way an agent sees it. Amounts below 0 are money out.
export function describeTransaction(t: Transaction, data: BudgetData) {
  const account = data.accounts.find((a) => a.id === t.accountId);
  const category = data.categories.find((c) => c.id === t.categoryId);
  const goal = t.goalId ? data.goals?.find((g) => g.id === t.goalId) : undefined;
  return {
    id: t.id,
    date: t.postedOn,
    description: t.description,
    amount: t.amount,
    account: account ? { id: account.id, name: account.name } : null,
    category: category
      ? {
          // Ids that start with "fallback:" are your bank's category, not one of yours.
          id: category.id,
          name: category.name,
          kind: category.kind,
          chosenByYou: Boolean(t.chosenCategoryId),
        }
      : null,
    goal: goal ? { id: goal.id, name: goal.name } : t.goalId ? { id: t.goalId, name: null } : null,
    pending: t.pending,
    reviewed: t.reviewed !== false,
  };
}

export function readRows<T>(result: { data: T | null; error: { message: string } | null }, what: string) {
  return check(result, what);
}
