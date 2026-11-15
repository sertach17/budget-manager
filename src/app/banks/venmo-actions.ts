"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type VenmoFormState = { ok: boolean; message: string } | null;

// The address Cloudflare listens on and hands to the Venmo email worker.
const INBOUND_ADDRESS = (process.env.VENMO_INBOUND_ADDRESS ?? "venmo@torrezhq.com").toLowerCase();

function readBalance(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) && Math.abs(amount) < 1_000_000 ? Math.round(amount * 100) / 100 : null;
}

// Creates the Venmo account with the balance you type, and the feed that
// forwarded Venmo emails fill from now on.
export async function startVenmo(_prev: VenmoFormState, form: FormData): Promise<VenmoFormState> {
  const { userId } = await requireTwoFactorUser();
  const balance = readBalance(form.get("balance"));
  const mailbox = String(form.get("mailbox") ?? "").trim().toLowerCase();
  if (balance === null) return { ok: false, message: "Type your Venmo balance, like 42.50." };
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(mailbox)) return { ok: false, message: "Type the email address Venmo writes to." };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("venmo_feeds").select("user_id").eq("user_id", userId).maybeSingle();
  if (existing) return { ok: false, message: "Venmo is already set up. Use Correct balance instead." };

  const now = new Date().toISOString();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .insert({
      user_id: userId,
      name: "Venmo",
      institution: "Venmo",
      type: "cash",
      source: "email",
      current_balance: balance,
      balance_updated_at: now,
    })
    .select("id")
    .single();
  if (accountError || !account) return { ok: false, message: "Couldn't create the Venmo account. Try again." };

  const { error } = await admin.from("venmo_feeds").insert({
    user_id: userId,
    account_id: account.id,
    inbound_address: INBOUND_ADDRESS,
    mailbox,
    balance_set_at: now,
  });
  if (error) {
    await admin.from("accounts").delete().eq("id", account.id).eq("user_id", userId);
    return { ok: false, message: "Couldn't start the Venmo feed. Try again." };
  }

  revalidatePath("/banks");
  revalidatePath("/");
  return { ok: true, message: "Venmo is set up. Emails from now on will update it." };
}

// When the app's Venmo balance drifts from the Venmo app (for example a
// purchase Venmo didn't email about), type the real one here.
export async function correctVenmoBalance(_prev: VenmoFormState, form: FormData): Promise<VenmoFormState> {
  const { userId } = await requireTwoFactorUser();
  const balance = readBalance(form.get("balance"));
  if (balance === null) return { ok: false, message: "Type your Venmo balance, like 42.50." };

  const admin = createAdminClient();
  const { data: feed } = await admin.from("venmo_feeds").select("account_id").eq("user_id", userId).maybeSingle();
  if (!feed) return { ok: false, message: "Set up Venmo first." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("accounts")
    .update({ current_balance: balance, balance_updated_at: now })
    .eq("id", feed.account_id)
    .eq("user_id", userId);
  if (error) return { ok: false, message: "Couldn't save the balance. Try again." };
  await admin.from("venmo_feeds").update({ balance_set_at: now }).eq("user_id", userId);

  revalidatePath("/banks");
  revalidatePath("/");
  return { ok: true, message: "Balance saved." };
}

// Hides Gmail's forwarding code or confirm link once you've used it.
export async function clearGmailConfirmation() {
  const { userId } = await requireTwoFactorUser();
  const admin = createAdminClient();
  await admin
    .from("venmo_feeds")
    .update({ gmail_confirmation: null, gmail_confirmation_url: null, gmail_confirmation_at: null })
    .eq("user_id", userId);
  revalidatePath("/banks");
}
