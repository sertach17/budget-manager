import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { AppHeader } from "../../app-header";
import { CategoryBudgetView } from "../category-view";

export const metadata: Metadata = { title: "Budget · Budget Manager" };

async function CategoryBudget({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await params).id);
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">This budget couldn&apos;t load. Try again in a minute.</p>;
  }
  if (!month.data.categories.some((c) => c.id === id)) notFound();
  return <CategoryBudgetView data={month.data} today={month.today} categoryId={id} yourCategories={month.yourCategories} />;
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
