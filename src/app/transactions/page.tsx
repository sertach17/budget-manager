import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows, type TransactionRow } from "@/lib/budget/from-db";
import { activeFilterCount, applyTransactionFilters, isNarrowed, likePattern, readFilters, searchAmount } from "@/lib/budget/filter-transactions";
import { easternToday } from "@/lib/dates";
import { GoalsProvider } from "../goal-picker";
import { AppHeader } from "../app-header";
import { TransactionsView } from "./transactions-view";

export const metadata: Metadata = { title: "Transactions · Budget Manager" };

const SHOWN = 300;
// With a category filter, or sorted by amount or name, up to this many
// matching rows are read (1,000 at a time, the most the database sends per
// request) and narrowed and sorted here.
const SEARCHED = 10000;
const PAGE = 1000;
const COLUMNS = "id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category, reviewed_at, goal_id";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function Transactions({ searchParams }: { searchParams: SearchParams }) {
  // Row-level security limits every query to this user's own rows.
  const { supabase } = await requireTwoFactorUser();
  const today = easternToday();
  const filters = readFilters(await searchParams);
  const narrowed = isNarrowed(filters);

  const accounts = await supabase.from("accounts").select("id, name, institution, type, mask, current_balance").eq("is_hidden", false);
  const accountIds = (accounts.data ?? []).map((a) => a.id);

  // The database narrows by everything it can. The category, which may come
  // from your bank's category, and sorting by amount or name happen below.
  const query = (from: number, to: number) => {
    let q = supabase
      .from("transactions")
      .select(COLUMNS, { count: "exact" })
      .in("account_id", accountIds)
      .lte("posted_on", filters.to && filters.to < today ? filters.to : today);
    if (filters.from) q = q.gte("posted_on", filters.from);
    if (filters.account) q = q.eq("account_id", filters.account);
    if (filters.status === "review") q = q.is("reviewed_at", null);
    if (filters.status === "reviewed") q = q.not("reviewed_at", "is", null);
    if (filters.q) {
      const like = likePattern(filters.q);
      const amount = searchAmount(filters.q);
      const any = [`description.ilike."${like}"`, `merchant.ilike."${like}"`];
      if (amount !== null) any.push(`amount.eq.${amount}`, `amount.eq.${-amount}`);
      q = q.or(any.join(","));
    }
    const oldest = filters.sort === "oldest";
    return q.order("posted_on", { ascending: oldest }).order("created_at", { ascending: oldest }).range(from, to);
  };

  // Only a category filter or a sort by amount or name needs more than the
  // first page of matches.
  const readAll = Boolean(filters.category) || !(filters.sort === "newest" || filters.sort === "oldest");
  const loadTransactions = async () => {
    if (!readAll) return query(0, SHOWN - 1);
    const rows: TransactionRow[] = [];
    let count: number | null = null;
    for (let from = 0; from < SEARCHED; from += PAGE) {
      const page = await query(from, from + PAGE - 1);
      if (page.error) return page;
      count = page.count;
      rows.push(...(page.data ?? []));
      if ((page.data?.length ?? 0) < PAGE) break;
    }
    return { data: rows, count, error: null };
  };

  const [transactions, categories, goals] = await Promise.all([
    accountIds.length ? loadTransactions() : Promise.resolve({ data: [] as TransactionRow[], count: 0, error: null }),
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
  if (!data.transactions.length && !narrowed) {
    return <p className="mt-8 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">No transactions yet.</p>;
  }

  const found = applyTransactionFilters(data, data.transactions, filters);
  const shown = found.slice(0, SHOWN);
  const rowsRead = transactions.data?.length ?? 0;
  // Read page by page, every match was counted here; otherwise the database
  // counted them.
  const matches = readAll ? found.length : Math.max(transactions.count ?? 0, shown.length);
  const yourCategories = (categories.data ?? []).map((c) => ({ id: c.id, name: c.name.trim(), kind: c.kind }));

  let note: string | null = null;
  if (matches > shown.length) {
    const filtered = Boolean(filters.q) || activeFilterCount(filters) > 0;
    note = filtered
      ? `Showing the first ${shown.length} of ${matches.toLocaleString("en-US")} matches.`
      : `Showing the first ${shown.length} of your ${matches.toLocaleString("en-US")} transactions.`;
  }
  if (readAll && rowsRead >= SEARCHED) {
    note = `Searched your latest ${SEARCHED.toLocaleString("en-US")} transactions.${note ? ` ${note}` : ""}`;
  }

  return (
    <GoalsProvider goals={(goals.data ?? []).map((g) => ({ id: g.id, name: g.name }))}>
      <TransactionsView data={data} transactions={shown} filters={filters} matches={matches} yourCategories={yourCategories} />
      {note ? <p className="mt-6 text-xs text-black/50 dark:text-white/50">{note}</p> : null}
    </GoalsProvider>
  );
}

export default function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <AppHeader active="transactions" />
      <h1 className="sr-only">Transactions</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Transactions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
