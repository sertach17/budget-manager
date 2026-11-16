import Link from "next/link";
import type { BudgetData, Transaction } from "@/lib/budget/types";
import { TransactionsView } from "../transactions/transactions-view";

// One account and its transactions, grouped by day. Shared by the signed-in
// page and the demo; the demo passes `onMove` and `onReview`.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AccountView({
  data,
  accountId,
  transactions,
  yourCategories,
  base = "",
  onMove,
  onReview,
}: {
  data: BudgetData;
  accountId: string;
  transactions: Transaction[]; // this account's, newest first
  yourCategories: { id: string; name: string }[];
  base?: string;
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
}) {
  const account = data.accounts.find((a) => a.id === accountId);
  const back = (
    <Link href={base || "/"} className="mt-6 inline-block text-sm text-emerald-600 dark:text-emerald-400">
      ← Dashboard
    </Link>
  );
  if (!account) {
    return (
      <>
        {back}
        <p className="mt-4 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          That account isn&apos;t here.
        </p>
      </>
    );
  }
  const owed = account.type === "credit" || account.type === "loan";

  return (
    <>
      {back}
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{account.name}</h1>
          <p className="text-xs text-black/50 dark:text-white/50">
            {account.institution}
            {account.mask ? ` ···${account.mask}` : ""}
          </p>
        </div>
        <p className="shrink-0 tabular-nums text-sm text-black/60 dark:text-white/60">
          {money.format(account.currentBalance)}
          {owed ? " owed" : ""}
        </p>
      </div>
      <p className="mt-1 text-xs text-black/50 dark:text-white/50">Tap a transaction to move it or mark it reviewed.</p>

      {transactions.length ? (
        <TransactionsView
          data={data}
          transactions={transactions}
          yourCategories={yourCategories}
          onMove={onMove}
          onReview={onReview}
        />
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-black/15 p-6 text-sm dark:border-white/20">
          No transactions in this account yet.
        </p>
      )}
    </>
  );
}
