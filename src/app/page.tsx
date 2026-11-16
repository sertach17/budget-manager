import Link from "next/link";
import { Suspense } from "react";
import { loadMonth } from "@/lib/budget/load";
import { DashboardView } from "./dashboard-view";
import { AppHeader } from "./app-header";

async function Dashboard() {
  const month = await loadMonth();
  if (!month.ok) {
    return <p className="mt-8 text-sm text-red-600 dark:text-red-400">Your data couldn&apos;t load. Try again in a minute.</p>;
  }
  const { data, today, hasCategories } = month;

  if (!data.accounts.length) {
    return (
      <section className="mt-8 rounded-2xl border border-dashed border-black/15 p-8 text-center dark:border-white/20">
        <p className="font-medium">No accounts yet.</p>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Connect a bank on the{" "}
          <Link href="/banks" className="underline">
            Banks
          </Link>{" "}
          page to see your money here.
        </p>
      </section>
    );
  }

  return (
    <>
      <DashboardView data={data} today={today} budgetHref="/budget" />
      {hasCategories ? null : (
        <p className="mt-6 text-xs text-black/50 dark:text-white/50">
          Categories come from your banks for now. Your own categories and budgets come next.
        </p>
      )}
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <AppHeader active="dashboard" />
      <h1 className="sr-only">Dashboard</h1>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}
