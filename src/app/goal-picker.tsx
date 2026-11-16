"use client";

import { createContext, useContext } from "react";
import type { PickGoal } from "@/lib/budget/types";

// Your goals, for the goal picker inside every transaction. Pages that list
// transactions wrap them in GoalsProvider. `onSetGoal` replaces saving to the
// database; the demo uses it to keep changes in the page only.

type GoalPicker = { goals: PickGoal[]; onSetGoal?: (transactionId: string, goalId: string) => void };

const GoalsContext = createContext<GoalPicker>({ goals: [] });

export function GoalsProvider({
  goals,
  onSetGoal,
  children,
}: {
  goals: PickGoal[];
  onSetGoal?: (transactionId: string, goalId: string) => void;
  children: React.ReactNode;
}) {
  return <GoalsContext.Provider value={{ goals, onSetGoal }}>{children}</GoalsContext.Provider>;
}

export function useGoalPicker() {
  return useContext(GoalsContext);
}
