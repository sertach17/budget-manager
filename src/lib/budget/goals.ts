import type { Account, Goal, Transaction } from "./types.ts";

// How far along each goal is. The same math runs on the signed-in site and
// in the demo.
//
// A goal's money comes from two places:
// - the account it follows: the amount you set aside from its balance, or
//   the whole balance when you chose all of it (with no account, the amount
//   you typed as already saved), and
// - transactions you tagged to it: money in adds, money out takes away.
// When a goal counts an account's whole balance, tagged transactions in that
// same account are already part of the balance, so they aren't added twice.

export type GoalProgress = {
  goal: Goal;
  account: Account | null;
  fromAccount: number; // set aside, the whole balance, or typed by hand
  tagged: number; // tagged transactions, added up
  taggedCount: number;
  saved: number;
  percent: number; // 0 to 100
  left: number; // still to save, never below 0
  monthsLeft: number | null; // null with no date
  perMonth: number | null; // to reach the target by its date
  pastDate: boolean; // the date has passed and the goal isn't reached
  // How far the account's balance falls short of what your goals set aside
  // from it, or 0. Only fixed amounts count; "all of it" can't fall short.
  shortBy: number;
};

const round = (n: number) => Math.round(n * 100) / 100;

// Months you have to save in, counting this month: from Nov 16 to Jan 31 is
// November, December and January, so 3. At least 1 until the date passes.
export function monthsLeft(today: string, targetDate: string): number {
  if (targetDate < today) return 0;
  const [y, m, d] = today.split("-").map(Number);
  const [ty, tm, td] = targetDate.split("-").map(Number);
  const months = ty * 12 + tm - (y * 12 + m) + (td >= d ? 1 : 0);
  return Math.max(months, 1);
}

// Accounts a goal can follow: money you have, not money you owe.
export function canHoldGoal(account: Account) {
  return account.type !== "credit" && account.type !== "loan";
}

export function goalProgress(
  goal: Goal,
  data: { accounts: Account[]; transactions: Transaction[]; goals?: Goal[] },
  today: string,
): GoalProgress {
  const account = goal.accountId ? (data.accounts.find((a) => a.id === goal.accountId) ?? null) : null;
  const wholeBalance = account !== null && goal.setAside === null;

  const fromAccount = account
    ? wholeBalance
      ? Math.max(account.currentBalance, 0)
      : (goal.setAside ?? 0)
    : goal.accountId
      ? 0 // its account is gone or hidden
      : (goal.setAside ?? 0);

  let tagged = 0;
  let taggedCount = 0;
  for (const t of data.transactions) {
    if (t.goalId !== goal.id) continue;
    if (wholeBalance && t.accountId === account.id) continue;
    tagged += t.amount;
    taggedCount += 1;
  }
  tagged = round(tagged);

  const saved = round(fromAccount + tagged);
  const left = round(Math.max(goal.target - saved, 0));
  const percent = goal.target > 0 ? Math.min(Math.max((saved / goal.target) * 100, 0), 100) : 0;

  const months = goal.targetDate ? monthsLeft(today, goal.targetDate) : null;
  const perMonth = months && left > 0 ? round(left / months) : null;
  const pastDate = months === 0 && left > 0;

  let shortBy = 0;
  if (account && !wholeBalance) {
    const setAsideHere = (data.goals ?? [goal])
      .filter((g) => g.accountId === account.id && g.setAside !== null)
      .reduce((sum, g) => sum + (g.setAside ?? 0), 0);
    shortBy = round(Math.max(setAsideHere - account.currentBalance, 0));
  }

  return {
    goal,
    account,
    fromAccount: round(fromAccount),
    tagged,
    taggedCount,
    saved,
    percent,
    left,
    monthsLeft: months,
    perMonth,
    pastDate,
    shortBy,
  };
}

// Every goal's progress: the closest date first, then goals with no date.
export function allGoalProgress(
  data: { accounts: Account[]; transactions: Transaction[]; goals?: Goal[] },
  today: string,
): GoalProgress[] {
  return (data.goals ?? [])
    .map((g) => goalProgress(g, data, today))
    .sort(
      (a, b) =>
        (a.goal.targetDate ?? "9999").localeCompare(b.goal.targetDate ?? "9999") || a.goal.name.localeCompare(b.goal.name),
    );
}
