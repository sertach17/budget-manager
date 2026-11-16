import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { plaidEnv } from "./client";
import { syncPlaidItem } from "./sync";

export type BankSyncResult = { bank: string; ok: boolean; added: number; removed: number; code?: string };

// Syncs every connected bank, one after another, for one person or (with no
// userId) for everyone. Uses the service-role client because access tokens
// live in a table nobody else can read.
export async function syncBanks(admin: SupabaseClient, userId?: string): Promise<BankSyncResult[]> {
  let query = admin
    .from("plaid_items")
    .select("id, user_id, access_token, sync_cursor, institution_name")
    .eq("environment", plaidEnv())
    .order("created_at");
  if (userId) query = query.eq("user_id", userId);
  const { data: items, error } = await query;
  if (error) throw new Error(`Reading bank connections failed: ${error.message}`);

  const results: BankSyncResult[] = [];
  for (const item of items ?? []) {
    const result = await syncPlaidItem(admin, item);
    results.push(
      result.ok
        ? { bank: item.institution_name ?? "Bank", ok: true, added: result.added, removed: result.removed }
        : { bank: item.institution_name ?? "Bank", ok: false, added: 0, removed: 0, code: result.code },
    );
  }
  return results;
}
