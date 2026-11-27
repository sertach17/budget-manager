import type { BudgetData, Transaction, PickCategory } from "@/lib/budget/types";
import { isNarrowed, type TransactionFilters as Filters } from "@/lib/budget/filter-transactions";
import { Suspense } from "react";
import { toRows } from "../budget/rows";
import { TransactionRow } from "../transaction-row";
import { TransactionFilters } from "./transaction-filters";

// Transactions grouped by day, newest first. Given `filters`, the search box,
// sort list and filters go on top, and a list sorted by amount or name is one
// list instead of days. Shared by the signed-in page and the demo; the demo
// passes `onMove` so moves stay in the page.

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function TransactionsView({
  data,
  transactions,
  filters,
  matches,
  yourCategories,
  onMove,
  onReview,
}: {
  data: BudgetData;
  transactions: Transaction[]; // already filtered and sorted
  filters?: Filters; // shows the search, sort and filters
  matches?: number; // every match, when more were found than are shown
  yourCategories: PickCategory[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const accounts = [...data.accounts]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ id: a.id, label: a.mask ? `${a.name} ···${a.mask}` : a.name }));
  const byDate = !filters || filters.sort === "newest" || filters.sort === "oldest";

  const days = new Map<string, Transaction[]>();
  if (byDate) {
    for (const t of transactions) {
      const list = days.get(t.postedOn) ?? [];
      list.push(t);
      days.set(t.postedOn, list);
    }
  }

  return (
    <>
      {filters ? (
        <Suspense fallback={<div className="mt-6 h-[6.5rem]" />}>
          <TransactionFilters accounts={accounts} categories={data.categories} matches={matches ?? transactions.length} />
        </Suspense>
      ) : null}
      {!transactions.length ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/20 p-6 text-sm text-white/70">
          {filters && isNarrowed(filters) ? "No transactions match. Try another search or clear the filters." : "No transactions yet."}
        </p>
      ) : byDate ? (
        <div className={`stagger ${filters ? "mt-5" : "mt-6"} space-y-6`}>
          {[...days].map(([day, list]) => (
            <section key={day}>
              <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-white/45">{formatDay(day)}</h2>
              <ul className="card mt-2 divide-y divide-line overflow-hidden">
                {toRows(data, list, "category").map((row) => (
                  <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} onReview={onReview} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="card mt-5 divide-y divide-line overflow-hidden">
          {toRows(data, transactions, "both").map((row) => (
            <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} onReview={onReview} />
          ))}
        </ul>
      )}
    </>
  );
}
