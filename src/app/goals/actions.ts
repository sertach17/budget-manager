"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { readGoal, type GoalInput } from "@/lib/budget/goal-input";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GoalResult = { ok: boolean; message: string; id?: string };

type Supabase = Awaited<ReturnType<typeof requireTwoFactorUser>>["supabase"];

// Checks the form and that its account is one of yours that holds money.
async function goalRow(supabase: Supabase, input: GoalInput) {
  const fields = readGoal(input);
  if (typeof fields === "string") return fields;
  if (fields.accountId) {
    if (!UUID.test(fields.accountId)) return "Pick one of your accounts.";
    // Row-level security only finds your own account.
    const { data: account } = await supabase.from("accounts").select("id, type").eq("id", fields.accountId).maybeSingle();
    if (!account) return "Pick one of your accounts.";
    if (account.type === "credit" || account.type === "loan") return "Pick an account that holds money, not a card or loan.";
  }
  return {
    name: fields.name,
    target_amount: fields.target,
    target_date: fields.targetDate,
    account_id: fields.accountId,
    set_aside: fields.setAside,
  };
}

export async function createGoal(input: GoalInput): Promise<GoalResult> {
  const { supabase } = await requireTwoFactorUser();
  const row = await goalRow(supabase, input);
  if (typeof row === "string") return { ok: false, message: row };
  const { data, error } = await supabase.from("goals").insert(row).select("id").single();
  if (error || !data) {
    if (error) console.error("Adding a goal failed:", error.message);
    return { ok: false, message: "Couldn't add the goal. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: `Added ${row.name}.`, id: data.id };
}

export async function updateGoal(id: string, input: GoalInput): Promise<GoalResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(String(id))) return { ok: false, message: "That goal couldn't be found." };
  const row = await goalRow(supabase, input);
  if (typeof row === "string") return { ok: false, message: row };
  const { data, error } = await supabase.from("goals").update(row).eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) console.error("Saving a goal failed:", error.message);
    return { ok: false, message: "Couldn't save the goal. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved.", id };
}

// Deleting a goal keeps its transactions; they just lose the goal tag.
export async function deleteGoal(id: string): Promise<GoalResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(String(id))) return { ok: false, message: "That goal couldn't be found." };
  const { data, error } = await supabase.from("goals").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    if (error) console.error("Deleting a goal failed:", error.message);
    return { ok: false, message: "Couldn't delete the goal. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Deleted." };
}

// Tags one transaction to a goal, or takes the tag off with an empty goal.
// Its category stays as it is.
export async function setTransactionGoal(transactionId: string, goalId: string): Promise<GoalResult> {
  const { supabase } = await requireTwoFactorUser();
  if (!UUID.test(String(transactionId))) return { ok: false, message: "That transaction couldn't be found." };
  if (goalId !== "" && !UUID.test(String(goalId))) return { ok: false, message: "Pick one of your goals." };
  // Row-level security only lets you change your own transaction, and the
  // table only accepts a goal that is also yours.
  const { data, error } = await supabase
    .from("transactions")
    .update({ goal_id: goalId || null })
    .eq("id", transactionId)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error("Tagging a goal failed:", error.message);
    return { ok: false, message: "Couldn't change the goal. Try again." };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}
