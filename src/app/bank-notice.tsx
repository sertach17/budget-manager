import Link from "next/link";
import { requireTwoFactorUser } from "@/lib/auth";
import { isPlaidConfigured, plaidEnv } from "@/lib/plaid/client";
import { bankStatus } from "@/lib/plaid/status";
import { createAdminClient } from "@/lib/supabase/admin";

// A note on the dashboard when a bank stopped syncing, so a missed morning
// sync doesn't go unnoticed. Shows nothing while every bank is fine.
export async function BankNotice() {
  if (!isPlaidConfigured()) return null;
  const { userId } = await requireTwoFactorUser();
  const { data: items } = await createAdminClient()
    .from("plaid_items")
    .select("institution_name, last_synced_at, last_error")
    .eq("user_id", userId)
    .eq("environment", plaidEnv());
  const problems = (items ?? []).map((item) => bankStatus(item)).filter((s) => s.kind !== "ok");
  if (!problems.length) return null;
  return (
    <div className="mt-6 rounded-xl bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
      {problems.map((p) => (
        <p key={p.message}>{p.message}</p>
      ))}
      <Link href="/banks" className="mt-1 inline-block font-semibold underline">
        Fix it on Banks
      </Link>
    </div>
  );
}
