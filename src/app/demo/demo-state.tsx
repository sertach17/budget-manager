"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Account, AccountType, BudgetData, PickCategory } from "@/lib/budget/types";
import type { OwnAccountInput, OwnAccountResult } from "@/app/banks/own-account-actions";
import { demoData, demoOwnAccounts } from "@/lib/demo/data";

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
};

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

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ today, children }: { today: string; children: React.ReactNode }) {
  const base = useMemo(() => demoData(today), [today]);
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(() => new Set());
  const [ownAccounts, setOwnAccounts] = useState<Account[]>(demoOwnAccounts);

  const addAccount = useCallback(async (input: OwnAccountInput): Promise<OwnAccountResult> => {
    const account = toAccount(`acc-own-${Date.now()}`, input);
    if (typeof account === "string") return { ok: false, message: account };
    setOwnAccounts((current) => [...current, account]);
    return { ok: true, message: `Added ${account.name}. The demo forgets it when you reload.` };
  }, []);
  const updateAccount = useCallback(async (id: string, input: OwnAccountInput): Promise<OwnAccountResult> => {
    const account = toAccount(id, input);
    if (typeof account === "string") return { ok: false, message: account };
    setOwnAccounts((current) => current.map((a) => (a.id === id ? account : a)));
    return { ok: true, message: "Saved." };
  }, []);
  const deleteAccount = useCallback(async (id: string): Promise<OwnAccountResult> => {
    setOwnAccounts((current) => current.filter((a) => a.id !== id));
    return { ok: true, message: "Deleted." };
  }, []);

  const review = useCallback((transactionIds: string[]) => {
    setReviewed((current) => new Set([...current, ...transactionIds]));
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
    const kept = base.transactions.filter((t) => !startedOwn.has(t.accountId) || own.has(t.accountId));
    const data = {
      ...base,
      accounts: [...linked, ...ownAccounts],
      transactions: kept.map((t) => {
        const moved = moves[t.id] ? { ...t, categoryId: moves[t.id], chosenCategoryId: moves[t.id] } : t;
        return reviewed.has(t.id) ? { ...moved, reviewed: true } : moved;
      }),
    };
    const yourCategories = [...base.categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, kind: c.kind }));
    return { data, today, yourCategories, move, review, ownAccountIds: own, addAccount, updateAccount, deleteAccount };
  }, [base, moves, reviewed, ownAccounts, today, move, review, addAccount, updateAccount, deleteAccount]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const state = useContext(DemoContext);
  if (!state) throw new Error("useDemo must be used inside DemoProvider");
  return state;
}
