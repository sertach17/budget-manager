import type { Account, Budget, BudgetData, Category, Transaction } from "@/lib/budget/types";

// Made-up data for the public demo. Nothing here comes from a real person or
// bank, and the demo never reads or writes the database.
//
// Transactions are generated for the current and previous month so the demo
// always looks current. The amounts come from a seeded random number
// generator, so the same month always shows the same numbers.

const accounts: Account[] = [
  { id: "acc-checking", name: "Everyday Checking", institution: "Demo Bank", type: "checking", mask: "4821", currentBalance: 3284.17 },
  { id: "acc-savings", name: "High-Yield Savings", institution: "Demo Bank", type: "savings", mask: "7310", currentBalance: 8950.0 },
  { id: "acc-card", name: "Rewards Card", institution: "Demo Card Co.", type: "credit", mask: "1937", currentBalance: 1142.63 },
];

const categories: Category[] = [
  { id: "cat-paycheck", name: "Paycheck", groupName: "Income", kind: "income", color: "#059669", isExcluded: false },
  { id: "cat-rent", name: "Rent", groupName: "Home", kind: "expense", color: "#7c3aed", isExcluded: false },
  { id: "cat-utilities", name: "Utilities", groupName: "Home", kind: "expense", color: "#2563eb", isExcluded: false },
  { id: "cat-groceries", name: "Groceries", groupName: "Food", kind: "expense", color: "#16a34a", isExcluded: false },
  { id: "cat-dining", name: "Dining out", groupName: "Food", kind: "expense", color: "#ea580c", isExcluded: false },
  { id: "cat-gas", name: "Gas", groupName: "Car", kind: "expense", color: "#ca8a04", isExcluded: false },
  { id: "cat-phone", name: "Phone", groupName: "Bills", kind: "expense", color: "#0891b2", isExcluded: false },
  { id: "cat-subscriptions", name: "Subscriptions", groupName: "Bills", kind: "expense", color: "#db2777", isExcluded: false },
  { id: "cat-shopping", name: "Shopping", groupName: "Personal", kind: "expense", color: "#9333ea", isExcluded: false },
  { id: "cat-kids", name: "Kids", groupName: "Family", kind: "expense", color: "#0d9488", isExcluded: false },
  { id: "cat-fun", name: "Entertainment", groupName: "Personal", kind: "expense", color: "#e11d48", isExcluded: false },
  { id: "cat-transfer", name: "Transfers", groupName: null, kind: "transfer", color: "#6b7280", isExcluded: true },
];

const budgets: Budget[] = [
  { categoryId: "cat-rent", amount: 1800 },
  { categoryId: "cat-utilities", amount: 220 },
  { categoryId: "cat-groceries", amount: 650 },
  { categoryId: "cat-dining", amount: 250 },
  { categoryId: "cat-gas", amount: 200 },
  { categoryId: "cat-phone", amount: 90 },
  { categoryId: "cat-subscriptions", amount: 40 },
  { categoryId: "cat-shopping", amount: 250 },
  { categoryId: "cat-kids", amount: 150 },
  { categoryId: "cat-fun", amount: 100 },
];

type Template = {
  days: number[];
  description: string | string[];
  categoryId: string;
  accountId: string;
  amount: number | [number, number]; // fixed, or a random range for spending
};

const templates: Template[] = [
  { days: [1, 15], description: "Payroll deposit", categoryId: "cat-paycheck", accountId: "acc-checking", amount: 2150 },
  { days: [1], description: "Maple Court Apartments", categoryId: "cat-rent", accountId: "acc-checking", amount: -1800 },
  { days: [6], description: "City Electric", categoryId: "cat-utilities", accountId: "acc-checking", amount: [-110, -80] },
  { days: [9], description: "Fiber Internet", categoryId: "cat-utilities", accountId: "acc-checking", amount: -64.99 },
  { days: [18], description: "Water and Sewer", categoryId: "cat-utilities", accountId: "acc-checking", amount: [-48, -35] },
  { days: [12], description: "Mobile Plan", categoryId: "cat-phone", accountId: "acc-checking", amount: -85 },
  { days: [3], description: "StreamFlix", categoryId: "cat-subscriptions", accountId: "acc-card", amount: -15.49 },
  { days: [8], description: "TuneBox Music", categoryId: "cat-subscriptions", accountId: "acc-card", amount: -10.99 },
  { days: [21], description: "CloudVault Storage", categoryId: "cat-subscriptions", accountId: "acc-card", amount: -2.99 },
  {
    days: [2, 6, 10, 14, 18, 23, 27],
    description: ["Green Grocer", "Fresh Market", "Corner Store", "Green Grocer"],
    categoryId: "cat-groceries",
    accountId: "acc-card",
    amount: [-145, -45],
  },
  {
    days: [4, 9, 13, 17, 20, 25, 29],
    description: ["Taco Spot", "Pizza Place", "Noodle House", "Coffee Corner", "Burger Bar"],
    categoryId: "cat-dining",
    accountId: "acc-card",
    amount: [-48, -9],
  },
  { days: [5, 12, 19, 26], description: "Quick Fuel", categoryId: "cat-gas", accountId: "acc-card", amount: [-56, -38] },
  { days: [7, 16, 24], description: ["Home Goods Store", "Online Shop", "Outlet Mall"], categoryId: "cat-shopping", accountId: "acc-card", amount: [-120, -18] },
  { days: [11, 22], description: ["School Supplies Co.", "Kids Activity Center"], categoryId: "cat-kids", accountId: "acc-card", amount: [-70, -20] },
  { days: [15, 28], description: ["Movie Theater", "Bowling Lanes"], categoryId: "cat-fun", accountId: "acc-card", amount: [-45, -15] },
  { days: [16], description: "Transfer to savings", categoryId: "cat-transfer", accountId: "acc-checking", amount: -300 },
  { days: [16], description: "Transfer from checking", categoryId: "cat-transfer", accountId: "acc-savings", amount: 300 },
  { days: [20], description: "Rewards Card payment", categoryId: "cat-transfer", accountId: "acc-checking", amount: -650 },
  { days: [20], description: "Payment received", categoryId: "cat-transfer", accountId: "acc-card", amount: 650 },
];

// Small seeded random number generator (mulberry32).
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

function monthTransactions(year: number, month: number): Transaction[] {
  const key = `${year}-${pad(month)}`;
  const random = seededRandom(hash(key));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const rows: Transaction[] = [];

  templates.forEach((template, templateIndex) => {
    template.days.forEach((day, i) => {
      if (day > daysInMonth) return;
      const description = Array.isArray(template.description)
        ? template.description[i % template.description.length]
        : template.description;
      const amount = Array.isArray(template.amount)
        ? Math.round((template.amount[0] + random() * (template.amount[1] - template.amount[0])) * 100) / 100
        : template.amount;
      rows.push({
        id: `${key}-${templateIndex}-${i}`,
        accountId: template.accountId,
        categoryId: template.categoryId,
        postedOn: `${key}-${pad(day)}`,
        description,
        merchant: description,
        amount,
        pending: false,
      });
    });
  });
  return rows;
}

// Demo data as of `today` (YYYY-MM-DD). The last two days' card purchases
// show as pending, like a real bank feed, and the last three days'
// transactions wait under "Pending to review".
export function demoData(today: string): BudgetData {
  const [year, month] = today.split("-").map(Number);
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  const pendingFrom = new Date(`${today}T00:00:00Z`);
  pendingFrom.setUTCDate(pendingFrom.getUTCDate() - 1);
  const pendingCutoff = pendingFrom.toISOString().slice(0, 10);
  pendingFrom.setUTCDate(pendingFrom.getUTCDate() - 1);
  const reviewCutoff = pendingFrom.toISOString().slice(0, 10);

  const transactions = [...monthTransactions(previous.year, previous.month), ...monthTransactions(year, month)]
    .filter((t) => t.postedOn <= today)
    .map((t) => ({
      ...t,
      pending: t.accountId === "acc-card" && t.amount < 0 && t.postedOn >= pendingCutoff,
      reviewed: t.postedOn < reviewCutoff,
    }));

  return { accounts, categories, transactions, budgets };
}
