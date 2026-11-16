import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { easternToday } from "@/lib/dates";
import { DemoProvider } from "./demo-state";

// Public demo for visitors such as recruiters. It mirrors the signed-in site
// page for page, but everything on it is made up and built into the app; it
// never reads or writes the database.

async function DemoShell({ children }: { children: React.ReactNode }) {
  // Read the date per request, not at build time, so the demo stays current.
  await connection();
  return <DemoProvider today={easternToday()}>{children}</DemoProvider>;
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
        <p>Demo with made-up accounts and spending. No real bank data is shown, and nothing you change is saved.</p>
        <Link href="/login" className="font-medium underline">
          Leave demo
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <DemoShell>{children}</DemoShell>
      </Suspense>
    </main>
  );
}
