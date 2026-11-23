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
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-white/70">{formatMonth(summary.month)}</p>
        <span className="rounded-full border border-line bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-white/60">
          {summary.daysLeft} {summary.daysLeft === 1 ? "day" : "days"} left
        </span>
      </div>
      <div className="mt-3 animate-rise">
        <BudgetCard summary={summary} />
      </div>

      <ul className="card stagger mt-4 divide-y divide-line overflow-hidden">
        {summary.byCategory.map(({ category, spent, budget }) => {
          const share = budget ? Math.min(spent / budget, 1) : 1;
          const over = budget !== null && spent > budget;
          const left = budget !== null ? budget - spent : null;
          return (
            <li key={category.id}>
              <Link
                href={`${base}/budget/${encodeURIComponent(category.id)}`}
                className="block px-4 py-3.5 transition-colors hover:bg-white/[0.03] active:bg-white/[0.06]"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 font-medium">
                    <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                    <span className="truncate">{category.name.trim()}</span>
                  </span>
                  <span className={`tabular-nums ${over ? "text-red-600 dark:text-red-400" : "text-black/60 dark:text-white/60"}`}>
                    {wholeMoney.format(spent)}
                    {budget !== null ? ` of ${wholeMoney.format(budget)}` : ""}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                  <div
                    className="h-full origin-left animate-grow rounded-full"
                    style={{
                      width: `${Math.round(share * 100)}%`,
                      backgroundImage: over
                        ? "linear-gradient(90deg, #fb7185, #f43f5e)"
                        : `linear-gradient(90deg, color-mix(in srgb, ${category.color} 70%, white), ${category.color})`,
                    }}
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
