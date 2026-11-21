"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { linkWalletAccount } from "@/lib/wallet/apply";
import { secretKey } from "@/lib/wallet/verify";

export type WalletFormState = { ok: boolean; message: string } | null;

// Makes your WalletFeed web address. Its random id is what WalletFeed posts to.
export async function startWalletFeed() {
  const { userId } = await requireTwoFactorUser();
  const admin = createAdminClient();
  const { error } = await admin.from("wallet_feeds").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (error) console.error("Starting the Wallet feed failed", { message: error.message });
  revalidatePath("/banks");
}

// Saves the signing secret you copied from WalletFeed. It's never shown back.
export async function saveWalletSecret(_prev: WalletFormState, form: FormData): Promise<WalletFormState> {
  const { userId } = await requireTwoFactorUser();
  const secret = String(form.get("secret") ?? "").replace(/\s+/g, "");
  if (!secretKey(secret)) {
    return { ok: false, message: "That isn't a WalletFeed signing secret. It starts with whsec_." };
  }
  const { data, error } = await createAdminClient()
    .from("wallet_feeds")
    .update({ signing_secret: secret, secret_set_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("user_id");
  if (error || !data?.length) return { ok: false, message: "Couldn't save the secret. Try again." };
  revalidatePath("/banks");
  return { ok: true, message: "Saved. Press Send Test in WalletFeed to check the connection." };
}

// Picks which of your accounts a Wallet account fills.
export async function linkWalletAccountAction(_prev: WalletFormState, form: FormData): Promise<WalletFormState> {
  const { userId } = await requireTwoFactorUser();
  const walletAccountId = String(form.get("wallet_account_id") ?? "");
  const accountId = String(form.get("account_id") ?? "");
  if (!walletAccountId || walletAccountId.length > 200) return { ok: false, message: "Reload the page and try again." };
  const result = await linkWalletAccount(createAdminClient(), userId, walletAccountId, accountId || null);
  revalidatePath("/banks");
  revalidatePath("/");
  return result;
}
