import type { Metadata } from "next";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { AppHeader } from "../app-header";
import { GoalsProvider } from "../goal-picker";
import { IncomeView } from "./income-view";

export const metadata: Metadata = { title: "Income · Budget Manager" };

async function Income() {
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your income couldn&apos;t load. Try again in a minute.</p>;
  }
  return (
    <GoalsProvider goals={month.yourGoals}>
      <IncomeView data={month.data} today={month.today} yourCategories={month.yourCategories} />
    </GoalsProvider>
  );
}

export default function IncomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="dashboard" />
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Income />
      </Suspense>
    </main>
  );
}
