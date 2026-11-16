import "server-only";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "./from-db";
import { easternToday } from "@/lib/dates";
import type { BudgetData } from "./types";

const COLUMNS = "id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category";

export type LoadedMonth =
  | { ok: true; data: BudgetData; today: string; hasCategories: boolean; yourCategories: { id: string; name: string }[] }
  | { ok: false };

// This month's money for the signed-in user, ready for the dashboard and the
// budget pages. Row-level security limits every query to their own rows.
export async function loadMonth(): Promise<LoadedMonth> {
  // Sends anyone without a two-factor session to sign in.
  const { supabase } = await requireTwoFactorUser();

  const today = easternToday();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [accounts, thisMonth, recent, categories, budgets] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, institution, type, mask, current_balance")
      .eq("is_hidden", false)
      .order("institution")
      .order("name"),
    supabase.from("transactions").select(COLUMNS).gte("posted_on", monthStart).lte("posted_on", today).limit(5000),
    supabase.from("transactions").select(COLUMNS).lte("posted_on", today).order("posted_on", { ascending: false }).limit(20),
    supabase.from("categories").select("id, name, group_name, kind, color, is_excluded, plaid_categories").order("name"),
    supabase.from("budgets").select("category_id, amount, month").or(`month.is.null,month.eq.${monthStart}`),
  ]);

  const failed = [accounts, thisMonth, recent, categories, budgets].find((r) => r.error);
  if (failed?.error) {
    console.error("Month query failed:", failed.error.message);
    return { ok: false };
  }

  // Both lists can hold the same row; keep one of each.
  const transactions = new Map([...(thisMonth.data ?? []), ...(recent.data ?? [])].map((t) => [t.id, t]));
  // A budget for this month wins over the every-month one.
  const sortedBudgets = [...(budgets.data ?? [])].sort((a, b) => (a.month === null ? -1 : 0) - (b.month === null ? -1 : 0));
  const budgetByCategory = new Map(sortedBudgets.map((b) => [b.category_id, b]));

  const data = budgetDataFromRows({
    accounts: accounts.data ?? [],
    transactions: [...transactions.values()],
    categories: categories.data ?? [],
    budgets: [...budgetByCategory.values()],
  });

  return {
    ok: true,
    data,
    today,
    hasCategories: Boolean(categories.data?.length),
    yourCategories: (categories.data ?? []).map((c) => ({ id: c.id, name: c.name.trim() })),
  };
}
