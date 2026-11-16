"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";

// Accounts you add yourself, like Apple Card, that no bank link fills in.
// Their transactions come from files you upload to them.

export type OwnAccountInput = {
  name: string;
  institution: string;
  type: string;
  mask: string;
  balance: string;
};

export type OwnAccountResult = { ok: boolean; message: string };

const TYPES = ["checking", "savings", "credit", "cash", "investment", "loan", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: string, max: number) {
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function readBalance(value: string): number | null | "bad" {
  if (value.trim() === "") return null;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  return Number.isFinite(amount) && Math.abs(amount) < 10_000_000 ? Math.round(amount * 100) / 100 : "bad";
}

function check(input: OwnAccountInput) {
  const name = clean(String(input.name ?? ""), 100);
  const institution = clean(String(input.institution ?? ""), 100) || null;
  const type = String(input.type ?? "");
  const mask = String(input.mask ?? "").trim() || null;
  const balance = readBalance(String(input.balance ?? ""));
  if (!name) return { error: "Give the account a name, like Apple Card." };
  if (!TYPES.includes(type)) return { error: "Pick the kind of account." };
  if (mask && !/^[0-9]{2,4}$/.test(mask)) return { error: "Last digits are 2 to 4 numbers, or leave it blank." };
  if (balance === "bad") return { error: "Type the balance as a number, like 1250.40." };
  return { row: { name, institution, type, mask, current_balance: balance } };
}

function done() {
  revalidatePath("/banks");
  revalidatePath("/");
}

export async function addOwnAccount(input: OwnAccountInput): Promise<OwnAccountResult> {
  const { supabase } = await requireTwoFactorUser();
  const checked = check(input);
  if (!checked.row) return { ok: false, message: checked.error! };
  const { error } = await supabase.from("accounts").insert({
    ...checked.row,
    source: "manual",
    balance_updated_at: checked.row.current_balance === null ? null : new Date().toISOString(),
  });
  if (error) return { ok: false, message: "Couldn't add it. Try again." };
  done();
  return { ok: true, message: `Added ${checked.row.name}.` };
}

export async function updateOwnAccount(id: string, input: OwnAccountInput): Promise<OwnAccountResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(id)) return { ok: false, message: "That account wasn't found." };
  const checked = check(input);
  if (!checked.row) return { ok: false, message: checked.error! };
  // A new balance starts counting again from today; renaming the account
  // keeps the day you last set the balance.
  const { data: before } = await supabase.from("accounts").select("current_balance").eq("id", id).maybeSingle();
  const was = before?.current_balance == null ? null : Number(before.current_balance);
  const balanceChanged = was !== checked.row.current_balance;
  const { data, error } = await supabase
    .from("accounts")
    .update(balanceChanged ? { ...checked.row, balance_updated_at: new Date().toISOString() } : checked.row)
    .eq("id", id)
    .in("source", ["manual", "upload"])
    .select("id");
  if (error || !data?.length) return { ok: false, message: "Couldn't save. Try again." };
  done();
  return { ok: true, message: "Saved." };
}

// Deleting an account deletes its transactions too.
export async function deleteOwnAccount(id: string): Promise<OwnAccountResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(id)) return { ok: false, message: "That account wasn't found." };
  const { data, error } = await supabase.from("accounts").delete().eq("id", id).in("source", ["manual", "upload"]).select("id");
  if (error || !data?.length) return { ok: false, message: "Couldn't delete it. Try again." };
  done();
  return { ok: true, message: "Deleted." };
}
