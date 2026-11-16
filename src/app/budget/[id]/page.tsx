import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { summarizeMonth } from "@/lib/budget/summary";
import { AppHeader } from "../../app-header";
import { TransactionRow } from "../../transaction-row";
import { toRows } from "../rows";

export const metadata: Metadata = { title: "Budget · Budget Manager" };

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

async function CategoryBudget({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">This budget couldn&apos;t load. Try again in a minute.</p>;
  }
  const { data, today } = month;
  const category = data.categories.find((c) => c.id === id);
  if (!category) notFound();

  const summary = summarizeMonth(data, today);
  const line = summary.byCategory.find((c) => c.category.id === id);
  const spent = line?.spent ?? 0;
  const budget = line?.budget ?? null;
  const over = budget !== null && spent > budget;

  const monthPrefix = today.slice(0, 7);
  const transactions = data.transactions
    .filter((t) => t.categoryId === id && t.postedOn.startsWith(monthPrefix) && t.postedOn <= today)
    .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  const rows = toRows(data, transactions, "date");

  return (
    <>
      <Link href="/budget" className="mt-6 inline-block text-sm text-emerald-600 dark:text-emerald-400">
        ← Budget
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">{category.name.trim()}</h1>
        <p className={`tabular-nums text-sm ${over ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
          {wholeMoney.format(spent)}
          {budget !== null ? ` of ${wholeMoney.format(budget)}` : " this month"}
        </p>
      </div>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">Tap a transaction to move it to another category.</p>

      {rows.length ? (
        <ul className="mt-4 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {rows.map((row) => (
            <TransactionRow key={row.id} t={row} categories={month.yourCategories} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          Nothing in this category this month.
        </p>
      )}
    </>
  );
}

export default function CategoryBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="budget" />
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <CategoryBudget params={params} />
      </Suspense>
    </main>
  );
}
