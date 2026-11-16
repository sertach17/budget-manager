import "server-only";
import type { requireTwoFactorUser } from "@/lib/auth";
import { balanceChange, easternDay } from "./own-balance";

type Supabase = Awaited<ReturnType<typeof requireTwoFactorUser>>["supabase"];

// After transactions are added to one of your own accounts, moves its
// balance by the ones dated after you last set it. Linked banks send their
// own balance, so they're left alone. The day you set the balance stays the
// same, so typing a balance on the Banks page is still the starting point.
export async function moveOwnBalance(supabase: Supabase, accountId: string, rows: { postedOn: string; amount: number }[]) {
  if (!rows.length) return;
  const { data: account } = await supabase
    .from("accounts")
    .select("type, source, current_balance, balance_updated_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!account || (account.source !== "manual" && account.source !== "upload")) return;
  const change = balanceChange(account.type, easternDay(account.balance_updated_at), rows);
  if (!change) return;
  const next = Math.round((Number(account.current_balance ?? 0) + change) * 100) / 100;
  const { error } = await supabase.from("accounts").update({ current_balance: next }).eq("id", accountId);
  if (error) console.error("Moving an account balance failed:", error.message);
}
