import type { BudgetData, Transaction, PickCategory } from "@/lib/budget/types";
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
  onReview,
}: {
  data: BudgetData;
  transactions: Transaction[]; // already newest first
  yourCategories: PickCategory[];
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const days = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = days.get(t.postedOn) ?? [];
    list.push(t);
    days.set(t.postedOn, list);
  }

  return (
    <div className="stagger mt-6 space-y-6">
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
  );
}
