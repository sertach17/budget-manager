"use server";

import { revalidatePath } from "next/cache";
import { requireTwoFactorUser } from "@/lib/auth";
import { PLAID_CODE } from "@/lib/budget/plaid-names";

export type CategoryFormState = { ok: boolean; message: string } | null;

const KINDS = ["expense", "income", "transfer"] as const;
const COLORS = ["#16a34a", "#ea580c", "#2563eb", "#9333ea", "#ca8a04", "#0891b2", "#db2777", "#7c3aed", "#0d9488", "#e11d48", "#4f46e5", "#65a30d"];

function readBudget(value: FormDataEntryValue | null): number | null | "bad" {
  if (typeof value !== "string" || value.trim() === "") return null;
  const amount = Number(value.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount < 0 || amount >= 10_000_000) return "bad";
  return Math.round(amount * 100) / 100;
}

function done() {
  revalidatePath("/categories");
  revalidatePath("/");
}

// Adds a category (no id) or changes one (id), with its monthly budget and
// the bank categories that sort into it.
export async function saveCategory(_prev: CategoryFormState, form: FormData): Promise<CategoryFormState> {
  const { supabase } = await requireTwoFactorUser();

  const id = String(form.get("id") ?? "") || null;
  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const kind = String(form.get("kind") ?? "expense");
  // Only spending categories have a budget; income and transfers never count.
  const budget = kind === "expense" ? readBudget(form.get("budget")) : null;
  const bankCategories = [...new Set(form.getAll("plaid").map(String))].filter((c) => PLAID_CODE.test(c)).slice(0, 60);

  if (name.length < 1 || name.length > 60) return { ok: false, message: "Give the category a name (up to 60 letters)." };
  if (!KINDS.includes(kind as (typeof KINDS)[number])) return { ok: false, message: "Pick spending, income or transfer." };
  if (budget === "bad") return { ok: false, message: "Type the budget as a number, like 150." };

  const { data: all, error: listError } = await supabase.from("categories").select("id, plaid_categories");
  if (listError) return { ok: false, message: "Couldn't save. Try again." };

  let categoryId = id;
  if (id) {
    const { error } = await supabase.from("categories").update({ name, kind, plaid_categories: bankCategories }).eq("id", id);
    if (error) return { ok: false, message: error.code === "23505" ? "You already have a category with that name." : "Couldn't save. Try again." };
  } else {
    const { data, error } = await supabase
      .from("categories")
      .insert({ name, kind, plaid_categories: bankCategories, color: COLORS[(all?.length ?? 0) % COLORS.length] })
      .select("id")
      .single();
    if (error || !data) return { ok: false, message: error?.code === "23505" ? "You already have a category with that name." : "Couldn't add it. Try again." };
    categoryId = data.id;
  }

  // Each bank category sorts into one place, so take these off the others.
  const taken = new Set(bankCategories);
  for (const other of all ?? []) {
    if (other.id === categoryId) continue;
    const list: string[] = other.plaid_categories ?? [];
    const kept = list.filter((c) => !taken.has(c));
    if (kept.length !== list.length) {
      await supabase.from("categories").update({ plaid_categories: kept }).eq("id", other.id);
    }
  }

  // The every-month budget (month is null).
  if (budget === null) {
    await supabase.from("budgets").delete().eq("category_id", categoryId).is("month", null);
  } else {
    const { data: existing } = await supabase.from("budgets").select("id").eq("category_id", categoryId).is("month", null).maybeSingle();
    const { error } = existing
      ? await supabase.from("budgets").update({ amount: budget }).eq("id", existing.id)
      : await supabase.from("budgets").insert({ category_id: categoryId, amount: budget });
    if (error) return { ok: false, message: "Saved the category, but not its budget. Try again." };
  }

  done();
  return { ok: true, message: id ? "Saved." : `Added ${name}.` };
}

// Deletes a category and its budget. Its transactions keep their history and
// go back to your bank's category.
export async function deleteCategory(id: string): Promise<CategoryFormState> {
  const { supabase } = await requireTwoFactorUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, message: "Couldn't delete it." };
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, message: "Couldn't delete it. Try again." };
  done();
  return { ok: true, message: "Deleted." };
}
