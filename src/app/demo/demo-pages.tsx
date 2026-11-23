"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AgentsView, type AgentChange, type ConnectedAgent } from "../agents/agents-view";
import { AccountView } from "../accounts/account-view";
import { AccountsFooter, AccountsList } from "../accounts/accounts-list";
import { IncomeView } from "../income/income-view";
import { summarizeMonth } from "@/lib/budget/summary";
import { OwnAccounts } from "../banks/own-accounts";
import { AppHeader } from "../app-header";
import { BudgetView } from "../budget/budget-view";
import { CategoryBudgetView } from "../budget/category-view";
import { DashboardView } from "../dashboard-view";
import { GoalView } from "../goals/goal-view";
import { GoalsView } from "../goals/goals-view";
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

export function DemoAccounts() {
  const { data } = useDemo();
  const accounts = [...data.accounts].sort(
    (a, b) => (a.institution ?? "").localeCompare(b.institution ?? "") || a.name.localeCompare(b.name),
  );
  return (
    <>
      <AppHeader demo active="accounts" />
      <h1 className="sr-only">Accounts</h1>
      <div className="mt-6">
        <AccountsList accounts={accounts} base="/demo" />
        <AccountsFooter base="/demo" />
      </div>
    </>
  );
}

export function DemoAccount() {
  const { data, today, yourCategories, move, review, ownAccountIds, addManual, checkUpload, saveUpload } = useDemo();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  const transactions = data.transactions
    .filter((t) => t.accountId === id)
    .sort((a, b) => b.postedOn.localeCompare(a.postedOn) || a.id.localeCompare(b.id));
  return (
    <>
      <AppHeader demo active="accounts" />
      <AccountView
        data={data}
        accountId={id}
        transactions={transactions}
        yourCategories={yourCategories}
        base="/demo"
        own={ownAccountIds.has(id)}
        today={today}
        onMove={move}
        onReview={review}
        onAdd={addManual}
        upload={{
          sample: { fileName: "Sample Pay Card export.csv", text: demoStatementCsv(today) },
          sampleScreenshot: demoScreenshotRows(today),
          onCheck: checkUpload,
          onSave: saveUpload,
          onReadScreenshot: async () => ({
            ok: false,
            message: "Reading real screenshots is off in the demo. Try the made-up sample screenshot.",
          }),
        }}
      />
    </>
  );
}

export function DemoGoals() {
  const { data, today, createGoal } = useDemo();
  return (
    <>
      <AppHeader demo active="goals" />
      <h1 className="sr-only">Goals</h1>
      <GoalsView data={data} today={today} base="/demo" onCreate={createGoal} />
    </>
  );
}

export function DemoGoal() {
  const { data, today, yourCategories, move, review, updateGoal, deleteGoal } = useDemo();
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id ?? "");
  return (
    <>
      <AppHeader demo active="goals" />
      <GoalView
        data={data}
        goalId={id}
        today={today}
        base="/demo"
        yourCategories={yourCategories}
        onMove={move}
        onReview={review}
        onUpdate={updateGoal}
        onDelete={deleteGoal}
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
        className="btn-primary mt-6 rounded-xl px-4 py-2 text-sm font-medium opacity-50"
      >
        Connect a bank
      </button>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">
        Connecting a bank is off in the demo. Connected banks sync by themselves every morning around 6 AM.
      </p>
      <ul className="mt-8 space-y-4">
        {institutions.map((name) => (
          <li key={name} className="rounded-2xl border border-black/10 p-4 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{name}</p>
                <p className="text-xs text-black/50 dark:text-white/50">Made-up accounts · last synced today, 6:02 AM</p>
              </div>
              <button
                type="button"
                disabled
                className="rounded-lg border border-black/15 px-3 py-1.5 text-sm opacity-50 dark:border-white/20"
              >
                Sync now
              </button>
            </div>
            <ul className="mt-3 divide-y divide-black/10 text-sm dark:divide-white/[0.07]">
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
      <ul className="mt-6 divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/[0.07] dark:border-white/10">
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
        Add the transactions from files you download, like Apple Card exports, or from screenshots, to one of your own accounts. You can pick several at once.
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

// Made-up agents and changes for the demo's Connected agents page.
function demoAgents(today: string): { agents: ConnectedAgent[]; changes: AgentChange[] } {
  const at = (daysAgo: number, time: string) => {
    const d = new Date(`${today}T${time}:00-05:00`);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString();
  };
  return {
    agents: [
      { clientId: "demo-claude", name: "Claude", website: "claude.ai", connectedAt: at(6, "09:12") },
      { clientId: "demo-helper", name: "Budget Helper", website: null, connectedAt: at(2, "18:40") },
    ],
    changes: [
      { id: "c0", clientId: "demo-claude", tool: "sync_banks", summary: "Started a bank sync.", at: at(0, "08:06") },
      { id: "c1", clientId: "demo-claude", tool: "mark_reviewed", summary: "Marked 4 transactions reviewed.", at: at(0, "08:05") },
      { id: "c2", clientId: "demo-claude", tool: "set_transaction_category", summary: "Moved Corner Market ($23.18) to Groceries.", at: at(0, "08:04") },
      { id: "c3", clientId: "demo-helper", tool: "set_budget", summary: "Set Dining out to $250.00 every month.", at: at(1, "21:30") },
      { id: "c4", clientId: "demo-claude", tool: "set_transaction_goal", summary: "Tagged Transfer to Savings ($200.00) to Beach trip.", at: at(3, "12:15") },
    ],
  };
}

export function DemoAgents() {
  const { today } = useDemo();
  const [{ agents, changes }, setState] = useState(() => demoAgents(today));
  return (
    <>
      <AppHeader demo />
      <h1 className="mt-6 text-xl font-semibold">Connected agents</h1>
      <p className="mt-2 text-sm text-black/60 dark:text-white/60">
        AI agents you allowed to read and change your budget, as you, with the limits below.
      </p>
      <p className="mt-2 text-xs text-black/50 dark:text-white/50">These agents are made up; nothing connects to the demo.</p>
      <AgentsView
        agents={agents}
        changes={changes}
        connectUrl="https://budget.torrezhq.com/api/mcp"
        onDisconnect={async (clientId) => {
          setState((s) => ({ ...s, agents: s.agents.filter((a) => a.clientId !== clientId) }));
          return { ok: true, message: "Disconnected." };
        }}
      />
    </>
  );
}
