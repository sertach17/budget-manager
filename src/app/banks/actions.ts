"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { plaidClient, plaidEnv, plaidErrorCode } from "@/lib/plaid/client";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { createAdminClient } from "@/lib/supabase/admin";

type Result = { ok: true; message?: string } | { ok: false; message: string };

// Step 1 of connecting a bank: a short-lived token that opens Plaid Link.
export async function createLinkToken(): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const { userId } = await requireTwoFactorUser();
  try {
    const response = await plaidClient().link.createToken({
      user: { client_user_id: userId },
      client_name: "Budget Manager",
      products: ["transactions"],
      country_codes: ["US"],
      language: "en",
      transactions: { days_requested: 730 },
    });
    return { ok: true, token: response.link_token };
  } catch (error) {
    console.error("Plaid link token failed", { code: plaidErrorCode(error) });
    return { ok: false, message: `Plaid couldn't start (${plaidErrorCode(error)}).` };
  }
}

// Step 2: Link hands back a one-time public token. Swap it for the lasting
// access token, store it server-side only, and pull the first transactions.
export async function connectBank(publicToken: string): Promise<Result> {
  const { userId } = await requireTwoFactorUser();
  if (typeof publicToken !== "string" || !publicToken.startsWith("public-")) {
    return { ok: false, message: "That bank connection didn't finish. Try again." };
  }

  const plaid = plaidClient();
  const admin = createAdminClient();
  try {
    const { access_token, item_id } = await plaid.item.exchangePublicToken({ public_token: publicToken });
    const { item } = await plaid.item.get({ access_token });

    const { data: saved, error } = await admin
      .from("plaid_items")
      .insert({
        user_id: userId,
        item_id,
        access_token,
        environment: plaidEnv(),
        institution_id: item.institution_id ?? null,
        institution_name: item.institution_name ?? null,
      })
      .select("id, user_id, access_token, sync_cursor, institution_name")
      .single();
    if (error || !saved) throw new Error(`Saving the connection failed: ${error?.message}`);

    const result = await syncPlaidItem(admin, saved);
    revalidatePath("/banks");
    revalidatePath("/");
    return result.ok
      ? { ok: true, message: `Connected. ${result.accounts} accounts and ${result.added} transactions so far.` }
      : { ok: true, message: `Connected, but the first sync hit ${result.code}. Try Sync now in a minute.` };
  } catch (error) {
    console.error("Plaid connect failed", { code: plaidErrorCode(error) });
    return { ok: false, message: `Connecting failed (${plaidErrorCode(error)}).` };
  }
}

// Pull the latest from one connected bank.
export async function syncBank(itemId: string): Promise<Result> {
  const { userId } = await requireTwoFactorUser();
  const admin = createAdminClient();
  const { data: item } = await admin
    .from("plaid_items")
    .select("id, user_id, access_token, sync_cursor, institution_name")
    .eq("id", itemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!item) return { ok: false, message: "That bank connection wasn't found." };

  const result = await syncPlaidItem(admin, item);
  revalidatePath("/banks");
  revalidatePath("/");
  return result.ok
    ? { ok: true, message: `Synced. ${result.added} new or updated, ${result.removed} removed.` }
    : { ok: false, message: `Sync failed (${result.code}).` };
}
