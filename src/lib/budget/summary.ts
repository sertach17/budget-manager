import type { Account, BudgetData, Category, Transaction } from "./types";

export type CategorySpend = {
  category: Category;
  spent: number; // positive number of dollars spent this month
  budget: number | null;
};

export type MonthSummary = {
  month: string; // YYYY-MM
  daysInMonth: number;
  daysLeft: number;
  income: number;
  spent: number;
  budgeted: number;
  byCategory: CategorySpend[];
  recent: Transaction[];
  toReview: Transaction[]; // not reviewed yet, newest first
  // Spending so far this month, added up day by day: spentByDay[0] is the
  // total at the end of day 1, and the last entry is today's total.
  spentByDay: number[];
  netWorth: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Credit cards and loans are money owed, so they count against net worth.
function signedBalance(account: Account) {
  return account.type === "credit" || account.type === "loan"
    ? -Math.abs(account.currentBalance)
    : account.currentBalance;
}

// Sums up one month. `today` is YYYY-MM-DD; the month is the one it falls in.
export function summarizeMonth(data: BudgetData, today: string, recentCount = 8): MonthSummary {
  const month = today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const daysLeft = daysInMonth - Number(today.slice(8, 10));

  const categories = new Map(data.categories.map((c) => [c.id, c]));
  const budgets = new Map(data.budgets.map((b) => [b.categoryId, b.amount]));
  const thisMonth = data.transactions.filter((t) => t.postedOn.startsWith(month) && t.postedOn <= today);

  let income = 0;
  const spentByCategory = new Map<string, number>();
  const dayOfMonth = Number(today.slice(8, 10));
  const spentOnDay = new Array<number>(dayOfMonth).fill(0);
  for (const t of thisMonth) {
    const category = t.categoryId ? categories.get(t.categoryId) : undefined;
    if (category?.isExcluded || category?.kind === "transfer") continue;
    if (category?.kind === "income") {
      income += t.amount;
    } else if (category) {
      // Refunds (amount > 0) in an expense category lower its spending.
      spentByCategory.set(category.id, (spentByCategory.get(category.id) ?? 0) - t.amount);
      spentOnDay[Number(t.postedOn.slice(8, 10)) - 1] -= t.amount;
    }
  }

  const byCategory: CategorySpend[] = data.categories
    .filter((c) => c.kind === "expense" && !c.isExcluded)
    .map((category) => ({
      category,
      spent: round(spentByCategory.get(category.id) ?? 0),
      budget: budgets.get(category.id) ?? null,
    }))
    .filter((row) => row.spent !== 0 || row.budget !== null)
    .sort((a, b) => b.spent - a.spent);

  const recent = [...data.transactions]
    .filter((t) => t.postedOn <= today)
    .sort((a, b) => (a.postedOn === b.postedOn ? a.id.localeCompare(b.id) : b.postedOn.localeCompare(a.postedOn)))
    .slice(0, recentCount);

  let runningTotal = 0;
  const spentByDay = spentOnDay.map((amount) => round((runningTotal += amount)));

  return {
    month,
    daysInMonth,
    daysLeft,
    income: round(income),
    spent: round(byCategory.reduce((sum, row) => sum + row.spent, 0)),
    budgeted: round(byCategory.reduce((sum, row) => sum + (row.budget ?? 0), 0)),
    byCategory,
    recent,
    toReview: data.transactions
      .filter((t) => t.reviewed === false)
      .sort((a, b) => (a.postedOn === b.postedOn ? a.id.localeCompare(b.id) : b.postedOn.localeCompare(a.postedOn))),
    spentByDay,
    netWorth: round(data.accounts.reduce((sum, a) => sum + signedBalance(a), 0)),
  };
}
