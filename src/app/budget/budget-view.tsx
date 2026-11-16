import Link from "next/link";
import type { MonthSummary } from "@/lib/budget/summary";
import { BudgetCard } from "../budget-card";

// The Budget page's content. It only takes data, so the signed-in page and
// the demo share it. `base` is "" on the real site and "/demo" in the demo.

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function formatMonth(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function BudgetView({ summary, base = "" }: { summary: MonthSummary; base?: string }) {
  return (
    <>
      <p className="mt-6 text-sm text-black/60 dark:text-white/60">
        {formatMonth(summary.month)} · {summary.daysLeft} {summary.daysLeft === 1 ? "day" : "days"} left
      </p>
      <div className="mt-3">
        <BudgetCard summary={summary} />
      </div>

      <ul className="mt-6 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
        {summary.byCategory.map(({ category, spent, budget }) => {
          const share = budget ? Math.min(spent / budget, 1) : 1;
          const over = budget !== null && spent > budget;
          const left = budget !== null ? budget - spent : null;
          return (
            <li key={category.id}>
              <Link
                href={`${base}/budget/${encodeURIComponent(category.id)}`}
                className="block px-4 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{category.name.trim()}</span>
                  <span className={`tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
                    {wholeMoney.format(spent)}
                    {budget !== null ? ` of ${wholeMoney.format(budget)}` : ""}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.round(share * 100)}%`, backgroundColor: over ? "#dc2626" : category.color }}
                  />
                </div>
                {left !== null ? (
                  <p className={`mt-1 text-xs tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-black/50 dark:text-white/50"}`}>
                    {over ? `${wholeMoney.format(-left)} over` : `${wholeMoney.format(left)} left`}
                  </p>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-black/50 dark:text-white/50">
        Change categories and budgets in{" "}
        <Link href={`${base}/categories`} className="underline">
          Categories
        </Link>
        .
      </p>
    </>
  );
}
