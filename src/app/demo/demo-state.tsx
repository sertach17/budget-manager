"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Account, AccountType, BudgetData, Goal, PickCategory, Transaction } from "@/lib/budget/types";
import type { OwnAccountInput, OwnAccountResult } from "@/app/banks/own-account-actions";
import type { CheckResult, SaveResult } from "@/app/upload/actions";
import type { AddResult } from "@/app/accounts/actions";
import type { GoalResult } from "@/app/goals/actions";
import { GoalsProvider } from "@/app/goal-picker";
import { UnreviewProvider } from "@/app/review-undo";
import { readGoal, type GoalInput } from "@/lib/budget/goal-input";
import { NEW_INCOME } from "@/app/transactions/new-income";
import { readManualTransaction, type ManualInput } from "@/lib/budget/manual-transaction";
import { balanceChange } from "@/lib/budget/own-balance";
import { plaidGroup } from "@/lib/budget/from-db";
import { demoData, demoOwnAccounts } from "@/lib/demo/data";
import { statementFingerprints, type StatementFormat, type StatementRow } from "@/lib/statements/parse";

// The demo's made-up data, plus any transactions a visitor moved to another
// category or marked reviewed. Changes live only in this browser tab: nothing
// is saved anywhere, and a reload starts the demo fresh.

type DemoState = {
  data: BudgetData;
  today: string;
  yourCategories: PickCategory[];
  move: (transactionId: string, categoryId: string) => void;
  review: (transactionIds: string[]) => void;
  ownAccountIds: ReadonlySet<string>;
  addAccount: (input: OwnAccountInput) => Promise<OwnAccountResult>;
  updateAccount: (id: string, input: OwnAccountInput) => Promise<OwnAccountResult>;
  deleteAccount: (id: string) => Promise<OwnAccountResult>;
  checkUpload: (accountId: string, rows: StatementRow[]) => Promise<CheckResult>;
  saveUpload: (input: {
    accountId: string;
    fileName: string;
    format: StatementFormat;
    rows: StatementRow[];
    toReview: boolean;
  }) => Promise<SaveResult>;
  addManual: (accountId: string, input: ManualInput) => Promise<AddResult>;
  createGoal: (input: GoalInput) => Promise<GoalResult>;
  updateGoal: (id: string, input: GoalInput) => Promise<GoalResult>;
  deleteGoal: (id: string) => Promise<GoalResult>;
};

// Which demo category a statement row's bank-style category lands in.
const DEMO_CATEGORY: Record<string, string> = {
  FOOD_AND_DRINK_RESTAURANT: "cat-dining",
  FOOD_AND_DRINK_GROCERIES: "cat-groceries",
  TRANSPORTATION_GAS: "cat-gas",
  GENERAL_MERCHANDISE: "cat-shopping",
  ENTERTAINMENT: "cat-fun",
  RENT_AND_UTILITIES: "cat-utilities",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "cat-transfer",
  TRANSFER_IN: "cat-transfer",
  TRANSFER_OUT: "cat-transfer",
  INCOME: "cat-paycheck",
};

function demoCategoryFor(row: StatementRow) {
  const code = row.category;
  const found = code ? (DEMO_CATEGORY[code] ?? DEMO_CATEGORY[plaidGroup(code) ?? ""]) : undefined;
  return found ?? (row.amount > 0 ? "cat-transfer" : "cat-shopping");
}

const TYPES: AccountType[] = ["checking", "savings", "credit", "cash", "investment", "loan", "other"];

// Same checks the signed-in site makes, so the demo behaves the same way.
function toAccount(id: string, input: OwnAccountInput): Account | string {
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 100);
  const mask = input.mask.trim();
  const balanceText = input.balance.trim();
  const balance = balanceText === "" ? 0 : Number(balanceText.replace(/[$,\s]/g, ""));
  if (!name) return "Give the account a name, like Apple Card.";
  if (!TYPES.includes(input.type as AccountType)) return "Pick the kind of account.";
  if (mask && !/^[0-9]{2,4}$/.test(mask)) return "Last digits are 2 to 4 numbers, or leave it blank.";
  if (!Number.isFinite(balance) || Math.abs(balance) >= 10_000_000) return "Type the balance as a number, like 1250.40.";
  return {
    id,
    name,
    institution: input.institution.trim().slice(0, 100) || null,
    type: input.type as AccountType,
    mask: mask || null,
    currentBalance: Math.round(balance * 100) / 100,
  };
}

// A day before or after a YYYY-MM-DD date.
function shiftDay(day: string, by: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + by);
  return d.toISOString().slice(0, 10);
}

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ today, children }: { today: string; children: React.ReactNode }) {
  const base = useMemo(() => demoData(today), [today]);
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(() => new Set());
  // Ones moved back to "Pending to review", including ones the demo started reviewed.
  const [unreviewed, setUnreviewed] = useState<ReadonlySet<string>>(() => new Set());
  const [ownAccounts, setOwnAccounts] = useState<Account[]>(demoOwnAccounts);
  const [uploaded, setUploaded] = useState<Transaction[]>([]);
  const [uploadedPrints, setUploadedPrints] = useState<ReadonlySet<string>>(() => new Set());
  // The day each own account's balance was set. On the real site that's the
  // day you type it and only later transactions move it; the demo starts a
  // little earlier so its made-up recent transactions show the balance move.
  const [balanceSetOn, setBalanceSetOn] = useState<Record<string, string>>(() =>
    Object.fromEntries(demoOwnAccounts.map((a) => [a.id, shiftDay(today, -7)])),
  );
  const moveBalance = useCallback(
    (accountId: string, rows: { postedOn: string; amount: number }[]) => {
      setOwnAccounts((current) =>
        current.map((a) => {
          if (a.id !== accountId) return a;
          const change = balanceChange(a.type, balanceSetOn[a.id] ?? null, rows);
          return change ? { ...a, currentBalance: Math.round((a.currentBalance + change) * 100) / 100 } : a;
        }),
      );
    },
    [balanceSetOn],
  );

  const addAccount = useCallback(async (input: OwnAccountInput): Promise<OwnAccountResult> => {
    const account = toAccount(`acc-own-${Date.now()}`, input);
    if (typeof account === "string") return { ok: false, message: account };
    setOwnAccounts((current) => [...current, account]);
    setBalanceSetOn((current) => ({ ...current, [account.id]: shiftDay(today, -1) }));
    return { ok: true, message: `Added ${account.name}. The demo forgets it when you reload.` };
  }, [today]);
  const updateAccount = useCallback(async (id: string, input: OwnAccountInput): Promise<OwnAccountResult> => {
    const account = toAccount(id, input);
    if (typeof account === "string") return { ok: false, message: account };
    const before = ownAccounts.find((a) => a.id === id);
    setOwnAccounts((current) => current.map((a) => (a.id === id ? account : a)));
    if (before && before.currentBalance !== account.currentBalance) {
      setBalanceSetOn((current) => ({ ...current, [id]: shiftDay(today, -1) }));
    }
    return { ok: true, message: "Saved." };
  }, [ownAccounts, today]);
  const deleteAccount = useCallback(async (id: string): Promise<OwnAccountResult> => {
    setOwnAccounts((current) => current.filter((a) => a.id !== id));
    return { ok: true, message: "Deleted." };
  }, []);

  // Fingerprints of what an account already has, worked out the same way
  // the signed-in site does it.
  const existing = useCallback(
    (accountId: string) => {
      const rows = base.transactions
        .filter((t) => t.accountId === accountId)
        .map((t) => ({ postedOn: t.postedOn, amount: t.amount, description: t.description, merchant: t.merchant }));
      return new Set([...statementFingerprints(accountId, rows), ...uploadedPrints]);
    },
    [base, uploadedPrints],
  );
  const checkUpload = useCallback(
    async (accountId: string, rows: StatementRow[]): Promise<CheckResult> => {
      if (!ownAccounts.some((a) => a.id === accountId)) return { ok: false, message: "Pick one of your own accounts." };
      const have = existing(accountId);
      return { ok: true, already: statementFingerprints(accountId, rows).map((p) => have.has(p)) };
    },
    [ownAccounts, existing],
  );
  const saveUpload = useCallback(
    async (input: { accountId: string; rows: StatementRow[]; toReview: boolean }): Promise<SaveResult> => {
      const account = ownAccounts.find((a) => a.id === input.accountId);
      if (!account) return { ok: false, message: "Pick one of your own accounts." };
      const have = existing(account.id);
      const prints = statementFingerprints(account.id, input.rows);
      const stamp = Date.now();
      const added: Transaction[] = input.rows
        .map((r, i) => ({ r, print: prints[i], i }))
        .filter(({ print }) => !have.has(print))
        .map(({ r, i }) => ({
          id: `up-${stamp}-${i}`,
          accountId: account.id,
          categoryId: demoCategoryFor(r),
          postedOn: r.postedOn,
          // The real site shows the cleaner merchant name when there is one.
          description: r.merchant || r.description,
          merchant: r.merchant,
          amount: r.amount,
          pending: false,
          reviewed: !input.toReview,
        }));
      setUploaded((current) => [...current, ...added]);
      setUploadedPrints((current) => new Set([...current, ...prints]));
      moveBalance(account.id, added);
      const already = input.rows.length - added.length;
      return {
        ok: true,
        added: added.length,
        already,
        message: `Added ${added.length} ${added.length === 1 ? "transaction" : "transactions"} to ${account.name}${
          already ? `, skipped ${already} you already had` : ""
        }. The demo forgets them when you reload.`,
      };
    },
    [ownAccounts, existing, moveBalance],
  );

  // A transaction typed in, checked the way the signed-in site checks it.
  const addManual = useCallback(
    async (accountId: string, input: ManualInput): Promise<AddResult> => {
      const account = [...base.accounts, ...ownAccounts].find((a) => a.id === accountId);
      if (!account) return { ok: false, message: "That account couldn't be found." };
      const row = readManualTransaction(input, today);
      if (typeof row === "string") return { ok: false, message: row };
      const categoryId = row.categoryId === NEW_INCOME ? "cat-paycheck" : row.categoryId || null;
      const [print] = statementFingerprints(account.id, [row]);
      setUploaded((current) => [
        ...current,
        {
          id: `typed-${Date.now()}`,
          accountId: account.id,
          categoryId,
          chosenCategoryId: categoryId,
          postedOn: row.postedOn,
          description: row.description,
          merchant: null,
          amount: row.amount,
          pending: false,
        },
      ]);
      setUploadedPrints((current) => new Set([...current, print]));
      if (ownAccounts.some((a) => a.id === account.id)) moveBalance(account.id, [row]);
      return { ok: true, message: `Added ${row.description} to ${account.name}. The demo forgets it when you reload.` };
    },
    [base, ownAccounts, today, moveBalance],
  );

  // Goals, and goal tags you changed (an empty string takes a tag off).
  const [goals, setGoals] = useState<Goal[]>(() => base.goals ?? []);
  const [goalTags, setGoalTags] = useState<Record<string, string>>({});
  const goalFromInput = useCallback(
    (id: string, input: GoalInput): Goal | string => {
      const fields = readGoal(input);
      if (typeof fields === "string") return fields;
      if (fields.accountId) {
        const account = [...base.accounts, ...ownAccounts].find((a) => a.id === fields.accountId);
        if (!account) return "Pick one of your accounts.";
        if (account.type === "credit" || account.type === "loan") return "Pick an account that holds money, not a card or loan.";
      }
      return { id, ...fields };
    },
    [base, ownAccounts],
  );
  const createGoal = useCallback(
    async (input: GoalInput): Promise<GoalResult> => {
      const goal = goalFromInput(`goal-${Date.now()}`, input);
      if (typeof goal === "string") return { ok: false, message: goal };
      setGoals((current) => [...current, goal]);
      return { ok: true, message: `Added ${goal.name}. The demo forgets it when you reload.`, id: goal.id };
    },
    [goalFromInput],
  );
  const updateGoal = useCallback(
    async (id: string, input: GoalInput): Promise<GoalResult> => {
      const goal = goalFromInput(id, input);
      if (typeof goal === "string") return { ok: false, message: goal };
      setGoals((current) => current.map((g) => (g.id === id ? goal : g)));
      return { ok: true, message: "Saved.", id };
    },
    [goalFromInput],
  );
  const deleteGoal = useCallback(async (id: string): Promise<GoalResult> => {
    setGoals((current) => current.filter((g) => g.id !== id));
    return { ok: true, message: "Deleted." };
  }, []);
  const setGoal = useCallback((transactionId: string, goalId: string) => {
    setGoalTags((current) => ({ ...current, [transactionId]: goalId }));
  }, []);

  const review = useCallback((transactionIds: string[]) => {
    setReviewed((current) => new Set([...current, ...transactionIds]));
    setUnreviewed((current) => new Set([...current].filter((id) => !transactionIds.includes(id))));
  }, []);
  const unreview = useCallback((transactionIds: string[]) => {
    setUnreviewed((current) => new Set([...current, ...transactionIds]));
    setReviewed((current) => new Set([...current].filter((id) => !transactionIds.includes(id))));
  }, []);

  // An empty categoryId means "sort by my bank's category" again, which in
  // the demo is the category it came with.
  const move = useCallback((transactionId: string, categoryId: string) => {
    setMoves((current) => {
      const next = { ...current };
      if (categoryId) next[transactionId] = categoryId;
      else delete next[transactionId];
      return next;
    });
  }, []);

  const value = useMemo<DemoState>(() => {
    const own = new Set(ownAccounts.map((a) => a.id));
    const startedOwn = new Set(demoOwnAccounts.map((a) => a.id));
    const linked = base.accounts.filter((a) => !startedOwn.has(a.id));
    // A deleted own account takes its transactions with it.
    const kept = [
      ...base.transactions.filter((t) => !startedOwn.has(t.accountId) || own.has(t.accountId)),
      ...uploaded.filter((t) => own.has(t.accountId) || !startedOwn.has(t.accountId)),
    ];
    const goalIds = new Set(goals.map((g) => g.id));
    const data = {
      ...base,
      accounts: [...linked, ...ownAccounts],
      goals,
      transactions: kept.map((t) => {
        const moved = moves[t.id] ? { ...t, categoryId: moves[t.id], chosenCategoryId: moves[t.id] } : t;
        const tag = t.id in goalTags ? goalTags[t.id] || null : (t.goalId ?? null);
        // A deleted goal takes its tags with it.
        const tagged = { ...moved, goalId: tag && goalIds.has(tag) ? tag : null };
        if (reviewed.has(t.id)) return { ...tagged, reviewed: true };
        return unreviewed.has(t.id) ? { ...tagged, reviewed: false } : tagged;
      }),
    };
    const yourCategories = [...base.categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
    return {
      data,
      today,
      yourCategories,
      move,
      review,
      ownAccountIds: own,
      addAccount,
      updateAccount,
      deleteAccount,
      checkUpload,
      saveUpload,
      addManual,
      createGoal,
      updateGoal,
      deleteGoal,
    };
  }, [base, moves, reviewed, unreviewed, ownAccounts, uploaded, goals, goalTags, today, move, review, addAccount, updateAccount, deleteAccount, checkUpload, saveUpload, addManual, createGoal, updateGoal, deleteGoal]);

  return (
    <DemoContext.Provider value={value}>
      <GoalsProvider goals={goals.map((g) => ({ id: g.id, name: g.name }))} onSetGoal={setGoal}>
        <UnreviewProvider onUnreview={unreview}>
          {children}
        </UnreviewProvider>
      </GoalsProvider>
    </DemoContext.Provider>
  );
}

export function useDemo() {
  const state = useContext(DemoContext);
  if (!state) throw new Error("useDemo must be used inside DemoProvider");
  return state;
}
