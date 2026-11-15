import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plaid } from "plaid";
import type { AccountType } from "@/lib/budget/types";
import { plaidClient, plaidErrorCode } from "./client";

type PlaidItemRow = {
  id: string;
  user_id: string;
  access_token: string;
  sync_cursor: string | null;
};

// Plaid's account types mapped onto ours.
function accountType(account: Plaid.AccountBase): AccountType {
  switch (account.type) {
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
      return "investment";
    case "depository":
      return account.subtype === "savings" || account.subtype === "money market" || account.subtype === "cd"
        ? "savings"
        : "checking";
    default:
      return "other";
  }
}

function cleanMask(mask: string | null) {
  return mask && /^[0-9]{2,4}$/.test(mask) ? mask : null;
}

// Pulls accounts and every transaction change since the last sync for one
// Plaid connection, and saves them for that connection's owner. Uses the
// service-role client, so every row is written with item.user_id explicitly.
export async function syncPlaidItem(admin: SupabaseClient, item: PlaidItemRow) {
  const plaid = plaidClient();

  try {
    // 1. Accounts and balances.
    const { accounts } = await plaid.accounts.get({ access_token: item.access_token });
    const now = new Date().toISOString();
    const { data: savedAccounts, error: accountsError } = await admin
      .from("accounts")
      .upsert(
        accounts.map((a) => ({
          user_id: item.user_id,
          plaid_item_id: item.id,
          plaid_account_id: a.account_id,
          name: (a.name || a.official_name || "Account").slice(0, 100),
          type: accountType(a),
          source: "plaid",
          mask: cleanMask(a.mask),
          currency: a.balances.iso_currency_code ?? "USD",
          current_balance: a.balances.current,
          balance_updated_at: now,
        })),
        { onConflict: "plaid_account_id" },
      )
      .select("id, plaid_account_id");
    if (accountsError) throw new Error(`Saving accounts failed: ${accountsError.message}`);
    const accountIds = new Map((savedAccounts ?? []).map((a) => [a.plaid_account_id as string, a.id as string]));

    // 2. Transactions, page by page, from the saved cursor.
    let cursor = item.sync_cursor ?? undefined;
    let added = 0;
    let removed = 0;
    for (;;) {
      const page = await plaid.transactions.sync({ access_token: item.access_token, cursor, count: 500 });

      const rows = [...page.added, ...page.modified]
        .filter((t) => accountIds.has(t.account_id))
        .map((t) => ({
          user_id: item.user_id,
          account_id: accountIds.get(t.account_id)!,
          posted_on: t.date,
          description: (t.name || t.merchant_name || "Transaction").slice(0, 500),
          merchant: t.merchant_name ?? null,
          // Plaid: positive = money out. Ours: negative = money out.
          amount: -t.amount,
          pending: t.pending,
          source: "plaid",
          plaid_transaction_id: t.transaction_id,
          plaid_category: t.personal_finance_category?.detailed ?? null,
          // Plaid gives every transaction its own id, so it is the fingerprint.
          fingerprint: `plaid:${t.transaction_id}`,
        }));
      if (rows.length) {
        const { error } = await admin.from("transactions").upsert(rows, { onConflict: "plaid_transaction_id" });
        if (error) throw new Error(`Saving transactions failed: ${error.message}`);
        added += page.added.length;
      }

      const removedIds = page.removed.map((r) => r.transaction_id).filter(Boolean);
      if (removedIds.length) {
        const { error } = await admin
          .from("transactions")
          .delete()
          .eq("user_id", item.user_id)
          .in("plaid_transaction_id", removedIds);
        if (error) throw new Error(`Removing transactions failed: ${error.message}`);
        removed += removedIds.length;
      }

      cursor = page.next_cursor;
      // Save progress after every page so a later sync picks up from here.
      await admin.from("plaid_items").update({ sync_cursor: cursor }).eq("id", item.id);
      if (!page.has_more) break;
    }

    await admin.from("plaid_items").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("id", item.id);
    return { ok: true as const, accounts: accounts.length, added, removed };
  } catch (error) {
    const code = plaidErrorCode(error);
    await admin.from("plaid_items").update({ last_error: code }).eq("id", item.id);
    console.error("Plaid sync failed", { item: item.id, code });
    return { ok: false as const, code };
  }
}
