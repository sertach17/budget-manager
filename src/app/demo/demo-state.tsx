"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { BudgetData } from "@/lib/budget/types";
import { demoData } from "@/lib/demo/data";

// The demo's made-up data, plus any transactions a visitor moved to another
// category or marked reviewed. Changes live only in this browser tab: nothing
// is saved anywhere, and a reload starts the demo fresh.

type DemoState = {
  data: BudgetData;
  today: string;
  yourCategories: { id: string; name: string }[];
  move: (transactionId: string, categoryId: string) => void;
  review: (transactionIds: string[]) => void;
};

const DemoContext = createContext<DemoState | null>(null);

export function DemoProvider({ today, children }: { today: string; children: React.ReactNode }) {
  const base = useMemo(() => demoData(today), [today]);
  const [moves, setMoves] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(() => new Set());

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
    const data = {
      ...base,
      transactions: base.transactions.map((t) => {
        const moved = moves[t.id] ? { ...t, categoryId: moves[t.id], chosenCategoryId: moves[t.id] } : t;
        return reviewed.has(t.id) ? { ...moved, reviewed: true } : moved;
      }),
    };
    const yourCategories = [...base.categories]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name }));
    return { data, today, yourCategories, move, review };
  }, [base, moves, reviewed, today, move, review]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const state = useContext(DemoContext);
  if (!state) throw new Error("useDemo must be used inside DemoProvider");
  return state;
}
