import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "@/lib/budget/from-db";
import { easternToday } from "@/lib/dates";
import { AppHeader } from "../app-header";

export const metadata: Metadata = { title: "Transactions · Budget Manager" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const SHOWN = 300;

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function Transactions() {
  // Row-level security limits every query to this user's own rows.
  const { supabase } = await requireTwoFactorUser();
  const today = easternToday();

  const [accounts, transactions, categories] = await Promise.all([
    supabase.from("accounts").select("id, name, institution, type, mask, current_balance").eq("is_hidden", false),
    supabase
      .from("transactions")
      .select("id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category")
      .lte("posted_on", today)
      .order("posted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(SHOWN),
    supabase.from("categories").select("id, name, group_name, kind, color, is_excluded, plaid_categories"),
  ]);

  const failed = [accounts, transactions, categories].find((r) => r.error);
  if (failed?.error) {
    console.error("Transactions query failed:", failed.error.message);
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your transactions couldn&apos;t load. Try again in a minute.</p>;
  }

  const data = budgetDataFromRows({
    accounts: accounts.data ?? [],
    transactions: transactions.data ?? [],
    categories: categories.data ?? [],
    budgets: [],
  });
  if (!data.transactions.length) {
    return <p className="mt-8 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">No transactions yet.</p>;
  }

  const accountNames = new Map(data.accounts.map((a) => [a.id, a.mask ? `${a.name} ···${a.mask}` : a.name]));
  const categoryById = new Map(data.categories.map((c) => [c.id, c]));
  const days = new Map<string, typeof data.transactions>();
  for (const t of data.transactions) {
    const list = days.get(t.postedOn) ?? [];
    list.push(t);
    days.set(t.postedOn, list);
  }

  return (
    <div className="mt-6 space-y-6">
      {[...days].map(([day, list]) => (
        <section key={day}>
          <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">{formatDay(day)}</h2>
          <ul className="mt-2 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            {list.map((t) => {
              const category = t.categoryId ? categoryById.get(t.categoryId) : undefined;
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: category?.color ?? "#6b7280" }}
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.description}</p>
                      <p className="truncate text-xs text-black/50 dark:text-white/50">
                        {category?.name ?? "Uncategorized"} · {accountNames.get(t.accountId)}
                        {t.pending ? " · Pending" : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`shrink-0 tabular-nums ${t.amount > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                    {t.amount > 0 ? "+" : ""}
                    {money.format(t.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {(transactions.data?.length ?? 0) >= SHOWN ? (
        <p className="text-xs text-black/50 dark:text-white/50">Showing your latest {SHOWN} transactions.</p>
      ) : null}
    </div>
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
