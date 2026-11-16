import type { BudgetData, Transaction } from "@/lib/budget/types";
import { toRows } from "../budget/rows";
import { TransactionRow } from "../transaction-row";

// Transactions grouped by day, newest first. Shared by the signed-in page and
// the demo; the demo passes `onMove` so moves stay in the page.

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
  yourCategories,
  onMove,
}: {
  data: BudgetData;
  transactions: Transaction[]; // already newest first
  yourCategories: { id: string; name: string }[];
  onMove?: (transactionId: string, categoryId: string) => void;
}) {
  const days = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = days.get(t.postedOn) ?? [];
    list.push(t);
    days.set(t.postedOn, list);
  }

  return (
    <div className="mt-6 space-y-6">
      {[...days].map(([day, list]) => (
        <section key={day}>
          <h2 className="text-sm font-semibold text-black/60 dark:text-white/60">{formatDay(day)}</h2>
          <ul className="mt-2 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
            {toRows(data, list, "category").map((row) => (
              <TransactionRow key={row.id} t={row} categories={yourCategories} onMove={onMove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
