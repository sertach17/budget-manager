import { readAmount, readDate } from "../statements/parse.ts";

// What you type in the goal form. The same checks run in the demo and on the
// server.

export type GoalInput = {
  name: string;
  target: string; // like 6000 or $6,000
  targetDate: string; // YYYY-MM-DD, or "" for no date
  accountId: string; // "" for no account
  // With an account: "all" counts its whole balance, "part" counts `amount`.
  // With no account, `amount` is what you've already saved.
  from: "all" | "part";
  amount: string;
};

export type GoalFields = {
  name: string;
  target: number;
  targetDate: string | null;
  accountId: string | null;
  setAside: number | null;
};

const LIMIT = 10_000_000;

export function readGoal(input: GoalInput): GoalFields | string {
  const name = typeof input.name === "string" ? input.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  if (!name) return "Give the goal a name, like Summer vacation.";

  const target = typeof input.target === "string" ? readAmount(input.target) : null;
  if (target === null || target <= 0 || target >= LIMIT) return "Type how much you want to save, like 6000.";

  let targetDate: string | null = null;
  if (typeof input.targetDate === "string" && input.targetDate.trim()) {
    targetDate = readDate(input.targetDate.trim());
    if (!targetDate) return "Pick a date, or leave it blank.";
  }

  const accountId = typeof input.accountId === "string" && input.accountId ? input.accountId : null;
  let setAside: number | null = null;
  if (accountId && input.from === "all") {
    setAside = null;
  } else {
    const text = typeof input.amount === "string" ? input.amount.trim() : "";
    const amount = text === "" ? 0 : readAmount(text);
    if (amount === null || amount < 0 || amount >= LIMIT) {
      return accountId ? "Type how much of the account counts, like 2350." : "Type what you've saved so far, or 0.";
    }
    if (accountId && text === "") return "Type how much of the account counts, like 2350, or pick all of it.";
    setAside = Math.round(amount * 100) / 100;
  }

  return { name, target: Math.round(target * 100) / 100, targetDate, accountId, setAside };
}
