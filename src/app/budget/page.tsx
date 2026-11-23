import type { Metadata } from "next";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { summarizeMonth } from "@/lib/budget/summary";
import { AppHeader } from "../app-header";
import { BudgetView } from "./budget-view";

export const metadata: Metadata = { title: "Budget · Budget Manager" };

async function Budget() {
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your budget couldn&apos;t load. Try again in a minute.</p>;
  }
  return <BudgetView summary={summarizeMonth(month.data, month.today)} />;
}

export default function BudgetPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <AppHeader active="budget" />
      <h1 className="sr-only">Budget</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Budget />
      </Suspense>
    </main>
  );
}
