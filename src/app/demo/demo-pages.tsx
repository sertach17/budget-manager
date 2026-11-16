"use client";

import { useParams, useSearchParams } from "next/navigation";
import { AccountView } from "../accounts/account-view";
import { IncomeView } from "../income/income-view";
import { summarizeMonth } from "@/lib/budget/summary";
import { OwnAccounts } from "../banks/own-accounts";
import { AppHeader } from "../app-header";
import { BudgetView } from "../budget/budget-view";
import { CategoryBudgetView } from "../budget/category-view";
import { DashboardView } from "../dashboard-view";
import { TransactionsView } from "../transactions/transactions-view";
import { StatementUpload } from "../upload/statement-upload";
import { demoScreenshotRows, demoStatementCsv } from "@/lib/demo/data";
import { useDemo } from "./demo-state";

// The demo's pages. Each one is the real site's page fed with made-up data.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const kindLabel: Record<string, string> = { expense: "Spending", income: "Income", transfer: "Transfer (not counted)" };

export function DemoDashboard() {
  const { data, today, yourCategories, move, review } = useDemo();
  return (
    <>
      <AppHeader demo active="dashboard" />
      <h1 className="sr-only">Dashboard</h1>
      <DashboardView
        data={data}
        today={today}
        base="/demo"
        yourCategories={yourCategories}
        onMove={move}
        onReview={review}
      />
    </>
  );
}

export function DemoTransactions() {
  const { data, yourCategories, move, review } = useDemo();
  const newestFirst = [...data.transactions].sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  return (
    <>
      <AppHeader demo active="transactions" />
      <h1 className="sr-only">Transactions</h1>
      <TransactionsView data={data} transactions={newestFirst} yourCategories={yourCategories} onMove={move} onReview={review} />
    </>
  );
}

export function DemoBudget() {
  const { data, today } = useDemo();
  return (
    <>
      <AppHeader demo active="budget" />
      <h1 className="sr-only">Budget</h1>
      <BudgetView summary={summarizeMonth(data, today)} base="/demo" />
    </>
  );
}

export function DemoCategoryBudget() {
  const { data, today, yourCategories, move, review } = useDemo();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  return (
    <>
      <AppHeader demo active="budget" />
      <CategoryBudgetView data={data} today={today} categoryId={id} yourCategories={yourCategories} base="/demo" onMove={move} onReview={review} />
    </>
  );
}

export function DemoIncome() {
  const { data, today, yourCategories, move, review } = useDemo();
  return (
    <>
      <AppHeader demo active="dashboard" />
      <IncomeView data={data} today={today} yourCategories={yourCategories} base="/demo" onMove={move} onReview={review} />
    </>
  );
}

export function DemoAccount() {
  const { data, yourCategories, move, review } = useDemo();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  const transactions = data.transactions
    .filter((t) => t.accountId === id)
    .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  return (
    <>
      <AppHeader demo active="dashboard" />
      <AccountView
        data={data}
        accountId={id}
        transactions={transactions}
        yourCategories={yourCategories}
        base="/demo"
        onMove={move}
        onReview={review}
      />
    </>
  );
}

export function DemoBanks() {
  const { data, ownAccountIds, addAccount, updateAccount, deleteAccount } = useDemo();
  const linked = data.accounts.filter((a) => !ownAccountIds.has(a.id));
  const institutions = [...new Set(linked.map((a) => a.institution ?? "Bank"))];
  const own = data.accounts
    .filter((a) => ownAccountIds.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      institution: a.institution,
      type: a.type,
      mask: a.mask,
      balance: a.currentBalance,
      transactionCount: data.transactions.filter((t) => t.accountId === a.id).length,
    }));
  return (
    <>
      <AppHeader demo />
      <h1 className="mt-6 text-xl font-semibold">Banks</h1>
      <button
        type="button"
        disabled
        className="mt-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white opacity-50"
      >
        Connect a bank
      </button>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">Connecting a bank is off in the demo.</p>
      <ul className="mt-8 space-y-4">
        {institutions.map((name) => (
          <li key={name} className="rounded-2xl border border-black/10 p-4 dark:border-white/15">
            <p className="font-medium">{name}</p>
            <p className="text-xs text-black/50 dark:text-white/50">Made-up accounts</p>
            <ul className="mt-3 divide-y divide-black/10 text-sm dark:divide-white/10">
              {linked
                .filter((a) => (a.institution ?? "Bank") === name)
                .map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2">
                    <span>
                      {a.name}
                      {a.mask ? ` ···${a.mask}` : ""}
                    </span>
                    <span className="tabular-nums">{money.format(a.currentBalance)}</span>
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ul>
      <OwnAccounts accounts={own} base="/demo" onAdd={addAccount} onUpdate={updateAccount} onDelete={deleteAccount} />
    </>
  );
}

export function DemoCategories() {
  const { data } = useDemo();
  const budgetBy = new Map(data.budgets.map((b) => [b.categoryId, b.amount]));
  const items = [...data.categories].sort((a, b) => a.name.localeCompare(b.name));
  const total = items.reduce((sum, c) => sum + (c.kind === "expense" ? (budgetBy.get(c.id) ?? 0) : 0), 0);
  return (
    <>
      <AppHeader demo />
      <h1 className="mt-6 text-xl font-semibold">Categories</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        {items.length} categories · {wholeMoney.format(total)} budgeted a month
      </p>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">Adding, editing and deleting categories is off in the demo.</p>
      <ul className="mt-6 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
        {items.map((c) => {
          const budget = budgetBy.get(c.id);
          return (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-black/50 dark:text-white/50">{kindLabel[c.kind] ?? c.kind}</p>
                </div>
              </div>
              <span className="shrink-0 tabular-nums text-black/60 dark:text-white/60">
                {c.kind !== "expense" ? "" : budget !== undefined ? `${wholeMoney.format(budget)}/mo` : "No budget"}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function DemoUpload() {
  const { data, today, ownAccountIds, checkUpload, saveUpload } = useDemo();
  const params = useSearchParams();
  const accounts = data.accounts
    .filter((a) => ownAccountIds.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, type: a.type, mask: a.mask }));
  return (
    <>
      <AppHeader demo />
      <h1 className="mt-6 text-xl font-semibold">Upload a statement</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        Add the transactions from a file you download, like an Apple Card export, or from a screenshot, to one of your own accounts.
      </p>
      <StatementUpload
        accounts={accounts}
        initialAccountId={params.get("account") ?? undefined}
        base="/demo"
        sample={{ fileName: "Sample Pay Card export.csv", text: demoStatementCsv(today) }}
        sampleScreenshot={demoScreenshotRows(today)}
        onCheck={checkUpload}
        onSave={saveUpload}
        onReadScreenshot={async () => ({
          ok: false,
          message: "Reading real screenshots is off in the demo. Try the made-up sample screenshot.",
        })}
      />
    </>
  );
}
