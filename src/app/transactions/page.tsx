import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "@/lib/budget/from-db";
import { easternToday } from "@/lib/dates";
import { GoalsProvider } from "../goal-picker";
import { AppHeader } from "../app-header";
import { TransactionsView } from "./transactions-view";

export const metadata: Metadata = { title: "Transactions · Budget Manager" };

const SHOWN = 300;

async function Transactions() {
  // Row-level security limits every query to this user's own rows.
  const { supabase } = await requireTwoFactorUser();
  const today = easternToday();

  const [accounts, transactions, categories, goals] = await Promise.all([
    supabase.from("accounts").select("id, name, institution, type, mask, current_balance").eq("is_hidden", false),
    supabase
      .from("transactions")
      .select("id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category, reviewed_at, goal_id")
      .lte("posted_on", today)
      .order("posted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(SHOWN),
    supabase.from("categories").select("id, name, group_name, kind, color, is_excluded, plaid_categories").order("name"),
    supabase.from("goals").select("id, name, target_amount, target_date, account_id, set_aside").order("created_at"),
  ]);

  const failed = [accounts, transactions, categories, goals].find((r) => r.error);
  if (failed?.error) {
    console.error("Transactions query failed:", failed.error.message);
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your transactions couldn&apos;t load. Try again in a minute.</p>;
  }

  const data = budgetDataFromRows({
    accounts: accounts.data ?? [],
    transactions: transactions.data ?? [],
    categories: categories.data ?? [],
    budgets: [],
    goals: goals.data ?? [],
  });
  if (!data.transactions.length) {
    return <p className="mt-8 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">No transactions yet.</p>;
  }

  const yourCategories = (categories.data ?? []).map((c) => ({ id: c.id, name: c.name.trim(), kind: c.kind }));

  return (
    <GoalsProvider goals={(goals.data ?? []).map((g) => ({ id: g.id, name: g.name }))}>
      <TransactionsView data={data} transactions={data.transactions} yourCategories={yourCategories} />
      {(transactions.data?.length ?? 0) >= SHOWN ? (
        <p className="mt-6 text-xs text-black/50 dark:text-white/50">Showing your latest {SHOWN} transactions.</p>
      ) : null}
    </GoalsProvider>
  );
}

export default function TransactionsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="transactions" />
      <h1 className="sr-only">Transactions</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Transactions />
      </Suspense>
    </main>
  );
}
