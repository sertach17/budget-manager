import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { summarizeMonth } from "@/lib/budget/summary";
import { AppHeader } from "../app-header";
import { BudgetCard } from "../budget-card";

export const metadata: Metadata = { title: "Budget · Budget Manager" };

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

async function Budget() {
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your budget couldn&apos;t load. Try again in a minute.</p>;
  }
  const summary = summarizeMonth(month.data, month.today);

  return (
    <>
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        {formatMonth(summary.month)} · {summary.daysLeft} {summary.daysLeft === 1 ? "day" : "days"} left
      </p>
      <div className="mt-3">
        <BudgetCard summary={summary} />
      </div>

      <ul className="mt-6 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
        {summary.byCategory.map(({ category, spent, budget }) => {
          const share = budget ? Math.min(spent / budget, 1) : 1;
          const over = budget !== null && spent > budget;
          const left = budget !== null ? budget - spent : null;
          return (
            <li key={category.id}>
              <Link
                href={`/budget/${encodeURIComponent(category.id)}`}
                className="block px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{category.name.trim()}</span>
                  <span className={`tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
                    {wholeMoney.format(spent)}
                    {budget !== null ? ` of ${wholeMoney.format(budget)}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(share * 100)}%`, backgroundColor: over ? "#dc2626" : category.color }}
                  />
                </div>
                {left !== null ? (
                  <p className={`mt-1 text-xs tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-black/50 dark:text-white/50"}`}>
                    {over ? `${wholeMoney.format(-left)} over` : `${wholeMoney.format(left)} left`}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-black/50 dark:text-white/50">
        Change categories and budgets in{" "}
        <Link href="/categories" className="underline">
          Categories
        </Link>
        .
      </p>
    </>
  );
}

export default function BudgetPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="budget" />
      <h1 className="sr-only">Budget</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Budget />
      </Suspense>
    </main>
  );
}
