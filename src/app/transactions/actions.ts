"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MoveResult = { ok: boolean; message?: string };

// Puts one transaction in one of your categories. An empty category sends it
// back to sorting by your bank's category.
export async function setTransactionCategory(transactionId: string, categoryId: string): Promise<MoveResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(transactionId)) return { ok: false, message: "That transaction couldn't be found." };
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
