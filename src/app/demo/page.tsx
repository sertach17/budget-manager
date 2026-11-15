import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { easternToday } from "@/lib/dates";
import { demoData } from "@/lib/demo/data";
import { DashboardView } from "../dashboard-view";

export const metadata: Metadata = { title: "Demo · Budget Manager" };

async function DemoDashboard() {
  // Read the date per request, not at build time, so the demo stays current.
  await connection();
  const today = easternToday();
  return <DashboardView data={demoData(today)} today={today} />;
}

// Public demo for visitors such as recruiters. Everything on it is made up
// and built into the app; it never reads or writes the database.
export default function DemoPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        This is a demo with made-up accounts and spending. No real bank data is shown.
      </div>
      <header className="mt-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Budget Manager</p>
          <h1 className="text-2xl font-semibold">Demo budget</h1>
        </div>
        <Link href="/login" className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
          Leave demo
        </Link>
      </header>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <DemoDashboard />
      </Suspense>
    </main>
  );
}
