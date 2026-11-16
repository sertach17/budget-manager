import type { Metadata } from "next";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { budgetDataFromRows } from "@/lib/budget/from-db";
import { AppHeader } from "../app-header";
import { AccountsFooter, AccountsList } from "./accounts-list";

export const metadata: Metadata = { title: "Accounts · Budget Manager" };

async function Accounts() {
  // Row-level security limits the query to this user's own accounts.
  const { supabase } = await requireTwoFactorUser();
  const { data, error } = await supabase
    .from("accounts")
    .select("id, name, institution, type, mask, current_balance")
    .eq("is_hidden", false)
    .order("institution")
    .order("name");
  if (error) {
    console.error("Accounts query failed:", error.message);
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your accounts couldn&apos;t load. Try again in a minute.</p>;
  }
  const { accounts } = budgetDataFromRows({ accounts: data ?? [], transactions: [], categories: [], budgets: [] });
  if (!accounts.length) {
    return (
      <>
        <p className="mt-6 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">No accounts yet.</p>
        <AccountsFooter />
      </>
    );
  }
  return (
    <div className="mt-6">
      <AccountsList accounts={accounts} />
      <AccountsFooter />
    </div>
  );
}

export default function AccountsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="accounts" />
      <h1 className="sr-only">Accounts</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Accounts />
      </Suspense>
    </main>
  );
}
