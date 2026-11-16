import Link from "next/link";
import { summarizeMonth } from "@/lib/budget/summary";
import type { BudgetData } from "@/lib/budget/types";
import { TransactionRow } from "../transaction-row";
import { toRows } from "./rows";

// One budget category and this month's transactions in it. Shared by the
// signed-in page and the demo; the demo passes `onMove` so moves stay in the
// page instead of the database.

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function CategoryBudgetView({
  data,
  today,
  categoryId,
  yourCategories,
  base = "",
  onMove,
}: {
  data: BudgetData;
  today: string;
  categoryId: string;
  yourCategories: { id: string; name: string }[];
  base?: string;
  onMove?: (transactionId: string, categoryId: string) => void;
}) {
  const category = data.categories.find((c) => c.id === categoryId);
  if (!category) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
        That category isn&apos;t here.{" "}
        <Link href={`${base}/budget`} className="underline">
          Back to Budget
        </Link>
      </p>
    );
  }

  const summary = summarizeMonth(data, today);
  const line = summary.byCategory.find((c) => c.category.id === categoryId);
  const spent = line?.spent ?? 0;
  const budget = line?.budget ?? null;
  const over = budget !== null && spent > budget;

  const monthPrefix = today.slice(0, 7);
  const transactions = data.transactions
    .filter((t) => t.categoryId === categoryId && t.postedOn.startsWith(monthPrefix) && t.postedOn <= today)
    .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  const rows = toRows(data, transactions, "date");

  return (
    <>
      <Link href={`${base}/budget`} className="mt-6 inline-block text-sm text-emerald-600 dark:text-emerald-400">
        ← Budget
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">{category.name.trim()}</h1>
        <p className={`tabular-nums text-sm ${over ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
          {wholeMoney.format(spent)}
          {budget !== null ? ` of ${wholeMoney.format(budget)}` : " this month"}
        </p>
      </div>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">Tap a transaction to move it to another category.</p>

      {rows.length ? (
        <ul className="mt-4 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {rows.map((row) => (
            <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          Nothing in this category this month.
        </p>
      )}
    </>
  );
}
