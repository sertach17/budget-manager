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
};

export type Budget = {
  categoryId: string;
  amount: number; // monthly
};

export type BudgetData = {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  budgets: Budget[];
};

// One of your categories, as the move list shows it.
export type PickCategory = { id: string; name: string; kind?: string };
