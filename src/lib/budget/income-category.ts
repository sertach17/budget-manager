import "server-only";
import type { requireTwoFactorUser } from "@/lib/auth";

type Supabase = Awaited<ReturnType<typeof requireTwoFactorUser>>["supabase"];

// Your income category, making one called Income when you have none. It
// takes the bank's income too, unless another category already does.
export async function incomeCategory(supabase: Supabase) {
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
