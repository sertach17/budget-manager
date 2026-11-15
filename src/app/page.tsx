import Link from "next/link";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "@/lib/budget/from-db";
import { easternToday } from "@/lib/dates";
import { DashboardView } from "./dashboard-view";
import { AppHeader } from "./app-header";

async function Dashboard() {
  // Sends anyone without a two-factor session to sign in. The proxy checks
  // this too; checking here keeps the page safe if the proxy changes.
  const { supabase } = await requireTwoFactorUser();

  const today = easternToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const columns = "id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category";

  // Row-level security limits every query to this user's own rows.
  const [accounts, thisMonth, recent, categories, budgets] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, institution, type, mask, current_balance")
      .eq("is_hidden", false)
      .order("institution")
      .order("name"),
    supabase.from("transactions").select(columns).gte("posted_on", monthStart).lte("posted_on", today).limit(5000),
    supabase.from("transactions").select(columns).lte("posted_on", today).order("posted_on", { ascending: false }).limit(20),
    supabase.from("categories").select("id, name, group_name, kind, color, is_excluded, plaid_categories"),
    supabase.from("budgets").select("category_id, amount, month").or(`month.is.null,month.eq.${monthStart}`),
  ]);

  const failed = [accounts, thisMonth, recent, categories, budgets].find((r) => r.error);
  if (failed?.error) {
    console.error("Home page query failed:", failed.error.message);
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your data couldn&apos;t load. Try again in a minute.</p>;
  }

  if (!accounts.data?.length) {
    return (
      <section className="mt-8 rounded-2xl border border-dashed border-black/15 p-8 text-center dark:border-white/20">
        <p className="font-medium">No accounts yet.</p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Connect a bank on the{" "}
          <Link href="/banks" className="underline">
            Banks
          </Link>{" "}
          page to see your money here.
        </p>
      </section>
    );
  }

  // Both lists can hold the same row; keep one of each.
  const transactions = new Map([...(thisMonth.data ?? []), ...(recent.data ?? [])].map((t) => [t.id, t]));
  // A budget for this month wins over the every-month one.
  const sortedBudgets = [...(budgets.data ?? [])].sort((a, b) => (a.month === null ? -1 : 0) - (b.month === null ? -1 : 0));
  const budgetByCategory = new Map(sortedBudgets.map((b) => [b.category_id, b]));

  const data = budgetDataFromRows({
    accounts: accounts.data,
    transactions: [...transactions.values()],
    categories: categories.data ?? [],
    budgets: [...budgetByCategory.values()],
  });

  return (
    <>
      <DashboardView data={data} today={today} budgetHref="/categories" />
      {categories.data?.length ? null : (
        <p className="mt-6 text-xs text-black/50 dark:text-white/50">
          Categories come from your banks for now. Your own categories and budgets come next.
        </p>
      )}
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="dashboard" />
      <h1 className="sr-only">Dashboard</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
