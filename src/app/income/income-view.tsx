import Link from "next/link";
import { summarizeMonth } from "@/lib/budget/summary";
import type { BudgetData } from "@/lib/budget/types";
import { toRows } from "../budget/rows";
import { TransactionRow } from "../transaction-row";

// This month's income and the transactions behind it. Shared by the
// signed-in page and the demo; the demo passes `onMove` and `onReview`.

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function IncomeView({
  data,
  today,
  yourCategories,
  base = "",
  onMove,
  onReview,
}: {
  data: BudgetData;
  today: string;
  yourCategories: { id: string; name: string }[];
  base?: string;
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const summary = summarizeMonth(data, today);
  const rows = toRows(data, summary.incomeTransactions, "both");

  return (
    <>
      <Link href={base || "/"} className="mt-6 inline-block text-sm text-emerald-600 dark:text-emerald-400">
        ← Dashboard
      </Link>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold">Income</h1>
        <p className="tabular-nums text-sm text-black/60 dark:text-white/60">
          {wholeMoney.format(summary.income)} in {formatMonth(summary.month)}
        </p>
      </div>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">Tap a transaction to move it or mark it reviewed.</p>

      {rows.length ? (
        <ul className="mt-4 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
          {rows.map((row) => (
            <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} onReview={onReview} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          No income yet this month.
        </p>
      )}
    </>
  );
}
