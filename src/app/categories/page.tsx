import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireTwoFactorUser } from "@/lib/auth";
import { plaidCategoryLabel, PLAID_CODE } from "@/lib/budget/plaid-names";
import { AddCategoryForm, CategoryItem, type BankCategory } from "./category-forms";

export const metadata: Metadata = { title: "Categories · Budget Manager" };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

async function Categories() {
  const { supabase } = await requireTwoFactorUser();

  const [categories, budgets, seen] = await Promise.all([
    supabase.from("categories").select("id, name, kind, color, plaid_categories").order("name"),
    supabase.from("budgets").select("category_id, amount").is("month", null),
    supabase.from("transactions").select("plaid_category").not("plaid_category", "is", null).limit(10000),
  ]);

  if (categories.error || budgets.error) {
    console.error("Categories page query failed:", categories.error?.message ?? budgets.error?.message);
    return <p className="mt-6 text-sm text-red-600 dark:text-red-400">Your categories couldn&apos;t load. Try again in a minute.</p>;
  }

  const budgetBy = new Map((budgets.data ?? []).map((b) => [b.category_id, Number(b.amount)]));
  const items = (categories.data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    color: c.color,
    budget: budgetBy.get(c.id) ?? null,
    plaidCategories: c.plaid_categories ?? [],
  }));

  // The bank categories you can pick from: every one your transactions have
  // used, plus any already picked.
  const codes = new Set<string>();
  for (const t of seen.data ?? []) if (t.plaid_category && PLAID_CODE.test(t.plaid_category)) codes.add(t.plaid_category);
  for (const item of items) for (const c of item.plaidCategories) codes.add(c);
  const bankCategories: BankCategory[] = [...codes]
    .map((code) => ({ code, label: plaidCategoryLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const totalBudget = items.reduce((sum, i) => sum + (i.kind === "expense" ? (i.budget ?? 0) : 0), 0);

  return (
    <>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        {items.length} {items.length === 1 ? "category" : "categories"} · {money.format(totalBudget)} budgeted a month
      </p>
      <div className="mt-6">
        <AddCategoryForm bankCategories={bankCategories} />
      </div>
      {items.length ? (
        <ul className="mt-6 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {items.map((item) => (
            <CategoryItem key={item.id} item={item} bankCategories={bankCategories} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">No categories yet.</p>
      )}
    </>
  );
}

export default function CategoriesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Link href="/" className="text-sm underline">
        ← Budget Manager
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Categories</h1>
      <Suspense fallback={<p className="mt-6 text-sm">Loading…</p>}>
        <Categories />
      </Suspense>
    </main>
  );
}
