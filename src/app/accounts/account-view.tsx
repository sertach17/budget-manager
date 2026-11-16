import Link from "next/link";
import type { BudgetData, Transaction, PickCategory } from "@/lib/budget/types";
import { TransactionsView } from "../transactions/transactions-view";
import { AddTransaction } from "./add-transaction";

// One account and its transactions, grouped by day, with a button to add
// one. Shared by the signed-in page and the demo; the demo passes `onMove`,
// `onReview`, `onAdd` and `upload` to keep changes in the page.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AccountView({
  data,
  accountId,
  transactions,
  yourCategories,
  base = "",
  own,
  today,
  onMove,
  onReview,
  onAdd,
  upload,
}: {
  data: BudgetData;
  accountId: string;
  transactions: Transaction[]; // this account's, newest first
  yourCategories: PickCategory[];
  base?: string;
  own: boolean; // one of your own accounts, not a linked bank
  today: string;
  onMove?: (transactionId: string, categoryId: string) => void;
  onReview?: (transactionIds: string[]) => void;
  onAdd?: React.ComponentProps<typeof AddTransaction>["onAdd"];
  upload?: React.ComponentProps<typeof AddTransaction>["upload"];
}) {
  const account = data.accounts.find((a) => a.id === accountId);
  const back = (
    <Link href={`${base}/accounts`} className="mt-6 inline-block text-sm text-emerald-600 dark:text-emerald-400">
      ← Accounts
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
      <AddTransaction
        account={account}
        own={own}
        categories={yourCategories}
        today={today}
        base={base}
        onAdd={onAdd}
        upload={upload}
      />
      <p className="mt-4 text-xs text-black/50 dark:text-white/50">Tap a transaction to move it or mark it reviewed.</p>

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
