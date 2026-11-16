import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "@/lib/budget/from-db";
import { easternToday } from "@/lib/dates";
import { AppHeader } from "../../app-header";
import { AccountView } from "../account-view";

export const metadata: Metadata = { title: "Account · Budget Manager" };

const SHOWN = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Account({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  if (!UUID.test(id)) notFound();

  // Row-level security limits every query to this user's own rows.
  const { supabase } = await requireTwoFactorUser();
  const today = easternToday();

  const [accounts, transactions, categories] = await Promise.all([
    supabase.from("accounts").select("id, name, institution, type, mask, current_balance").eq("id", id),
    supabase
      .from("transactions")
      .select("id, account_id, category_id, posted_on, description, merchant, amount, pending, plaid_category, reviewed_at")
      .eq("account_id", id)
      .lte("posted_on", today)
      .order("posted_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(SHOWN),
    supabase.from("categories").select("id, name, group_name, kind, color, is_excluded, plaid_categories").order("name"),
  ]);

  const failed = [accounts, transactions, categories].find((r) => r.error);
  if (failed?.error) {
    console.error("Account query failed:", failed.error.message);
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">This account couldn&apos;t load. Try again in a minute.</p>;
  }
  if (!accounts.data?.length) notFound();

  const data = budgetDataFromRows({
    accounts: accounts.data,
    transactions: transactions.data ?? [],
    categories: categories.data ?? [],
    budgets: [],
  });
  const yourCategories = (categories.data ?? []).map((c) => ({ id: c.id, name: c.name.trim() }));

  return (
    <>
      <AccountView data={data} accountId={id} transactions={data.transactions} yourCategories={yourCategories} />
      {(transactions.data?.length ?? 0) >= SHOWN ? (
        <p className="mt-6 text-xs text-black/50 dark:text-white/50">Showing this account&apos;s latest {SHOWN} transactions.</p>
      ) : null}
    </>
  );
}

export default function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="dashboard" />
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Account params={params} />
      </Suspense>
    </main>
  );
}
