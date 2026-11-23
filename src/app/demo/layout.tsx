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
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.08] px-4 py-2.5 text-[13px] leading-snug text-amber-100/90">
        <p>
          <span className="font-semibold text-amber-300">Demo</span> with made-up accounts and spending. Nothing you change is saved.
        </p>
        <Link href="/login" className="shrink-0 font-medium text-amber-300 underline underline-offset-2">
          Leave demo
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm">Loading…</p>}>
        <DemoShell>{children}</DemoShell>
      </Suspense>
    </main>
  );
}
