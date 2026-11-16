import "server-only";
import type { PickCategory, PickGoal } from "@/lib/budget/types";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "./from-db";
import { easternToday } from "@/lib/dates";
import type { BudgetData } from "./types";

const COLUMNS = "id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category, reviewed_at, goal_id";
const GOAL_COLUMNS = "id, name, target_amount, target_date, account_id, set_aside";

// The most transactions "Pending to review" loads at once.
const TO_REVIEW = 200;

export type LoadedMonth =
  | {
      ok: true;
      data: BudgetData;
      today: string;
      hasCategories: boolean;
      yourCategories: PickCategory[];
      yourGoals: PickGoal[];
    }
  | { ok: false };

// This month's money for the signed-in user, ready for the dashboard and the
// budget pages. Row-level security limits every query to their own rows.
export async function loadMonth(): Promise<LoadedMonth> {
  // Sends anyone without a two-factor session to sign in.
  const { supabase } = await requireTwoFactorUser();

  const today = easternToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [accounts, thisMonth, recent, toReview, categories, budgets, goals, tagged] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, institution, type, mask, current_balance")
      .eq("is_hidden", false)
      .order("institution")
      .order("name"),
    supabase.from("transactions").select(COLUMNS).gte("posted_on", monthStart).lte("posted_on", today).limit(5000),
    supabase.from("transactions").select(COLUMNS).lte("posted_on", today).order("posted_on", { ascending: false }).limit(20),
    supabase
      .from("transactions")
      .select(COLUMNS)
      .is("reviewed_at", null)
      .order("posted_on", { ascending: false })
      .limit(TO_REVIEW),
    supabase.from("categories").select("id, name, group_name, kind, color, is_excluded, plaid_categories").order("name"),
    supabase.from("budgets").select("category_id, amount, month").or(`month.is.null,month.eq.${monthStart}`),
    supabase.from("goals").select(GOAL_COLUMNS).order("created_at"),
    // Every transaction tagged to a goal, whatever its date, for goal progress.
    supabase.from("transactions").select(COLUMNS).not("goal_id", "is", null).lte("posted_on", today).limit(5000),
  ]);

  const failed = [accounts, thisMonth, recent, toReview, categories, budgets, goals, tagged].find((r) => r.error);
  if (failed?.error) {
    console.error("Month query failed:", failed.error.message);
    return { ok: false };
  }

  // The lists can hold the same row; keep one of each.
  const transactions = new Map(
    [...(thisMonth.data ?? []), ...(recent.data ?? []), ...(toReview.data ?? []), ...(tagged.data ?? [])].map((t) => [t.id, t]),
  );
  // A budget for this month wins over the every-month one.
  const sortedBudgets = [...(budgets.data ?? [])].sort((a, b) => (a.month === null ? -1 : 0) - (b.month === null ? -1 : 0));
  const budgetByCategory = new Map(sortedBudgets.map((b) => [b.category_id, b]));

  const data = budgetDataFromRows({
    accounts: accounts.data ?? [],
    transactions: [...transactions.values()],
    categories: categories.data ?? [],
    budgets: [...budgetByCategory.values()],
    goals: goals.data ?? [],
  });

  return {
    ok: true,
    data,
    today,
    hasCategories: Boolean(categories.data?.length),
    yourCategories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name.trim(), kind: c.kind })),
    yourGoals: (goals.data ?? []).map((g) => ({ id: g.id, name: g.name })),
  };
}
