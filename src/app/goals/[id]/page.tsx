import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { AppHeader } from "../../app-header";
import { GoalsProvider } from "../../goal-picker";
import { GoalView } from "../goal-view";

export const metadata: Metadata = { title: "Goal · Budget Manager" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Goal({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  if (!UUID.test(id)) notFound();
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">This goal couldn&apos;t load. Try again in a minute.</p>;
  }
  if (!month.data.goals?.some((g) => g.id === id)) notFound();
  return (
    <GoalsProvider goals={month.yourGoals}>
      <GoalView data={month.data} goalId={id} today={month.today} yourCategories={month.yourCategories} />
    </GoalsProvider>
  );
}

export default function GoalPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <AppHeader active="goals" />
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Goal params={params} />
      </Suspense>
    </main>
  );
}
