import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

async function Dashboard() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  // The proxy already checks this; checking again here keeps the page safe
  // even if the proxy's matcher changes.
  if (data.claims.aal !== "aal2") redirect("/mfa");

  return (
    <section className="mt-8 rounded-2xl border border-dashed border-black/15 p-8 text-center dark:border-white/20">
      <p className="font-medium">You&apos;re signed in with two-factor.</p>
      <p className="mt-1 text-sm text-black/60 dark:text-white/60">
        Accounts, transactions and budgets come next.
      </p>
    </section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Budget Manager</p>
          <h1 className="text-2xl font-semibold">Your money</h1>
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20">
            Sign out
          </button>
        </form>
      </header>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Dashboard />
      </Suspense>
      <p className="mt-6 text-sm">
        <Link href="/account/password" className="underline">
          Change password
        </Link>
      </p>
    </main>
  );
}
