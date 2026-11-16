import type { BudgetData, Transaction } from "@/lib/budget/types";
import type { RowTransaction } from "../transaction-row";

function formatDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// Turns transactions into rows for TransactionRow. The grey line under each
// one names its date or category (whichever the page doesn't already show)
// and its account.
// "both" names the date and the category, for lists that mix days.
export function toRows(data: BudgetData, transactions: Transaction[], show: "date" | "category" | "both"): RowTransaction[] {
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const accounts = new Map(data.accounts.map((a) => [a.id, a.mask ? `${a.name} ···${a.mask}` : a.name]));
  return transactions.map((t) => {
    const category = t.categoryId ? categories.get(t.categoryId) : undefined;
    const categoryName = category?.name.trim() ?? "Uncategorized";
    const first =
      show === "date" ? formatDay(t.postedOn) : show === "category" ? categoryName : `${formatDay(t.postedOn)} · ${categoryName}`;
    return {
      id: t.id,
      description: t.description,
      amount: t.amount,
      pending: t.pending,
      detail: [first, accounts.get(t.accountId)].filter(Boolean).join(" · "),
      color: category?.color ?? "#6b7280",
      categoryId: t.chosenCategoryId ?? null,
      reviewed: t.reviewed !== false,
    };
  });
}
