import type { Metadata } from "next";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { AppHeader } from "../app-header";
import { GoalsView } from "./goals-view";

export const metadata: Metadata = { title: "Goals · Budget Manager" };

async function Goals() {
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your goals couldn&apos;t load. Try again in a minute.</p>;
  }
  return <GoalsView data={month.data} today={month.today} />;
}

export default function GoalsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <AppHeader active="goals" />
      <h1 className="sr-only">Goals</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Goals />
      </Suspense>
    </main>
  );
}
