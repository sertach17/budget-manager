import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { isPlaidConfigured, plaidEnv } from "@/lib/plaid/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConnectBankButton } from "./connect-button";
import { SyncButton } from "./sync-button";

export const metadata: Metadata = { title: "Banks · Budget Manager" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function when(timestamp: string | null) {
  if (!timestamp) return "never";
  return new Date(timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

async function Banks() {
  const { userId, supabase } = await requireTwoFactorUser();
  const env = plaidEnv();

  if (!isPlaidConfigured()) {
    return (
      <p className="mt-6 rounded-xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
        Plaid isn&apos;t set up on this site yet. Add PLAID_CLIENT_ID and PLAID_SECRET in Vercel.
      </p>
    );
  }

  // Connections come from the server-only table (never the access token);
  // accounts come through your own session, so row-level security applies.
  const [{ data: items }, { data: accounts }] = await Promise.all([
    createAdminClient()
      .from("plaid_items")
      .select("id, institution_name, environment, last_synced_at, last_error")
      .eq("user_id", userId)
      .eq("environment", env)
      .order("created_at"),
    supabase.from("accounts").select("id, name, type, mask, current_balance, plaid_item_id"),
  ]);

  return (
    <div className="mt-6">
      {env === "sandbox" ? (
        <p className="mb-4 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
          Test mode: this site uses Plaid&apos;s fake bank. Sign in there with user_good and pass_good.
        </p>
      ) : null}

      <ConnectBankButton />
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        You sign in to your bank on Plaid&apos;s screen. Your bank password never reaches this app.
      </p>

      <ul className="mt-8 space-y-4">
        {(items ?? []).map((item) => {
          const itemAccounts = (accounts ?? []).filter((a) => a.plaid_item_id === item.id);
          return (
            <li key={item.id} className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{item.institution_name ?? "Bank"}</p>
                  <p className="text-xs text-black/50 dark:text-white/50">Last synced {when(item.last_synced_at)}</p>
                  {item.last_error ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-400">Last sync hit {item.last_error}</p>
                  ) : null}
                </div>
                <SyncButton itemId={item.id} />
              </div>
              <ul className="mt-3 divide-y divide-black/10 text-sm dark:divide-white/10">
                {itemAccounts.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {a.name}
                      {a.mask ? ` ···${a.mask}` : ""}
                    </span>
                    <span className="tabular-nums">{a.current_balance === null ? "" : money.format(a.current_balance)}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function BanksPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <header>
        <Link href="/" className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          ← Budget Manager
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Banks</h1>
      </header>
      <Suspense fallback={<p className="mt-8 text-sm">Loading…</p>}>
        <Banks />
      </Suspense>
    </main>
  );
}
