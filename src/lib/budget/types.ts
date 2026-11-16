// Shapes the dashboard works with. They mirror the database tables in
// supabase/migrations, so the same view can show demo data now and real
// data later.
//
// Money convention: amount < 0 is money out, amount > 0 is money in.

export type AccountType = "checking" | "savings" | "credit" | "cash" | "investment" | "loan" | "other";

export type Account = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  mask: string | null;
  currentBalance: number;
};

export type CategoryKind = "expense" | "income" | "transfer";

export type Category = {
  id: string;
  name: string;
  groupName: string | null;
  kind: CategoryKind;
  color: string;
  isExcluded: boolean;
};

export type Transaction = {
  id: string;
  accountId: string;
  categoryId: string | null;
  // The category you picked by hand, if any; categoryId may instead come
  // from your bank's category.
  chosenCategoryId?: string | null;
  postedOn: string; // YYYY-MM-DD
  description: string;
  merchant: string | null;
  amount: number;
  pending: boolean;
  // False while it waits under "Pending to review"; left out means reviewed.
  reviewed?: boolean;
  // The goal it's tagged to, if any. It keeps its category as well.
  goalId?: string | null;
};

export type Budget = {
  categoryId: string;
  amount: number; // monthly
};

// Money you're saving toward something. A goal can follow one account:
// setAside is how much of its balance counts, or null for all of it. With no
// account, setAside is what you've already saved, typed by hand.
export type Goal = {
  id: string;
  name: string;
  target: number;
  targetDate: string | null; // YYYY-MM-DD
  accountId: string | null;
  setAside: number | null;
};

export type BudgetData = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
  goals?: Goal[];
};

// One of your goals, as the goal picker shows it.
export type PickGoal = { id: string; name: string };

// One of your categories, as the move list shows it.
export type PickCategory = { id: string; name: string; kind?: string };
