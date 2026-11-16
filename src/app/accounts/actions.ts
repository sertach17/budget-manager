"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { moveOwnBalance } from "@/lib/budget/apply-own-balance";
import { incomeCategory } from "@/lib/budget/income-category";
import { readManualTransaction, type ManualInput } from "@/lib/budget/manual-transaction";
import { easternToday } from "@/lib/dates";
import { statementFingerprints } from "@/lib/statements/parse";
import { NEW_INCOME } from "../transactions/new-income";

export type AddResult = { ok: boolean; message: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Adds one transaction you typed in to one of your accounts. You typed it,
// so it doesn't wait under Pending to review.
export async function addTransaction(accountId: string, input: ManualInput): Promise<AddResult> {
  const { supabase, userId } = await requireTwoFactorUser();
  if (!UUID.test(String(accountId))) return { ok: false, message: "That account couldn't be found." };
  const row = readManualTransaction(input, easternToday());
  if (typeof row === "string") return { ok: false, message: row };

  // Row-level security only finds your own account.
  const { data: account } = await supabase.from("accounts").select("id, name").eq("id", accountId).maybeSingle();
  if (!account) return { ok: false, message: "That account couldn't be found." };

  let categoryId = row.categoryId;
  if (categoryId === NEW_INCOME) {
    const found = await incomeCategory(supabase);
    if (!found) return { ok: false, message: "Couldn't make an Income category. Try again." };
    categoryId = found;
  }
  if (categoryId !== "" && !UUID.test(categoryId)) return { ok: false, message: "Pick one of your categories." };

  // Same fingerprint an upload gives it, so a statement you upload later
  // skips it instead of adding it twice. A second one just like it on the
  // same day gets the next number, the way an upload counts twins.
  const [first] = statementFingerprints(account.id, [row]);
  for (let n = 1; n <= 20; n++) {
    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      account_id: account.id,
      category_id: categoryId || null,
      posted_on: row.postedOn,
      description: row.description,
      amount: row.amount,
      pending: false,
      source: "manual",
      fingerprint: n === 1 ? first : `${first}:${n}`,
      reviewed_at: new Date().toISOString(),
    });
    if (!error) break;
    if (error.code !== "23505" || n === 20) {
      console.error("Adding a transaction failed:", error.message);
      return { ok: false, message: "Couldn't add it. Try again." };
    }
  }

  await moveOwnBalance(supabase, account.id, [row]);

  revalidatePath("/", "layout");
  return { ok: true, message: `Added ${row.description} to ${account.name}.` };
}
