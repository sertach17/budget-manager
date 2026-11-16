"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { NEW_INCOME } from "./new-income";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MoveResult = { ok: boolean; message?: string };

// Puts one transaction in one of your categories. An empty category sends it
// back to sorting by your bank's category.
export async function setTransactionCategory(transactionId: string, categoryId: string): Promise<MoveResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(transactionId)) return { ok: false, message: "That transaction couldn't be found." };
  if (categoryId === NEW_INCOME) {
    const found = await incomeCategory(supabase);
    if (!found) return { ok: false, message: "Couldn't make an Income category. Try again." };
    categoryId = found;
  }
  if (categoryId !== "" && !UUID.test(categoryId)) return { ok: false, message: "Pick one of your categories." };

  // Row-level security only lets you change your own transaction, and the
  // table only accepts a category that is also yours.
  const { data, error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId || null })
    .eq("id", transactionId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("Moving a transaction failed:", error.message);
    return { ok: false, message: "Couldn't move it. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

// Your income category, making one called Income when you have none. It
// takes the bank's income too, unless another category already does.
async function incomeCategory(supabase: Awaited<ReturnType<typeof requireTwoFactorUser>>["supabase"]) {
  const { data: existing } = await supabase.from("categories").select("id").eq("kind", "income").order("created_at").limit(1);
  if (existing?.length) return existing[0].id as string;
  const { data: all } = await supabase.from("categories").select("plaid_categories");
  const bankIncomeTaken = (all ?? []).some((c) => (c.plaid_categories ?? []).some((code: string) => code.startsWith("INCOME")));
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: "Income", kind: "income", color: "#059669", plaid_categories: bankIncomeTaken ? [] : ["INCOME"] })
    .select("id")
    .single();
  if (error || !data) {
    // Someone (another tab) may have just made it.
    const { data: again } = await supabase.from("categories").select("id").eq("kind", "income").order("created_at").limit(1);
    if (again?.length) return again[0].id as string;
    console.error("Making an Income category failed:", error?.message);
    return null;
  }
  return data.id as string;
}

// Marks transactions reviewed, which takes them off "Pending to review".
export async function markReviewed(transactionIds: string[]): Promise<MoveResult> {
  const { supabase } = await requireTwoFactorUser();
  const ids = [...new Set(transactionIds)];
  if (!ids.length || ids.length > 500 || !ids.every((id) => UUID.test(id))) {
    return { ok: false, message: "Those transactions couldn't be found." };
  }

  // Row-level security only lets you change your own transactions.
  const { error } = await supabase
    .from("transactions")
    .update({ reviewed_at: new Date().toISOString() })
    .in("id", ids)
    .is("reviewed_at", null);
  if (error) {
    console.error("Marking transactions reviewed failed:", error.message);
    return { ok: false, message: "Couldn't mark it reviewed. Try again." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
