// Turns one WalletFeed post into what it means for this app. Pure functions
// only (no database, no network), so they can be tested on sample posts.
//
// WalletFeed's amounts use the same sign as this app: below 0 is money out.
// A pending purchase keeps the same id when it posts, so it's updated in
// place, the way Plaid's are. Unknown fields and values are ignored.
import { easternDay } from "../budget/own-balance.ts";

export type WalletAccount = {
  walletAccountId: string;
  name: string | null;
  institution: string | null;
  accountType: "asset" | "liability" | null;
};

export type WalletTransaction = {
  walletTransactionId: string;
  walletAccountId: string;
  accountName: string | null;
  accountType: "asset" | "liability" | null;
  postedOn: string; // YYYY-MM-DD in New York time, the day of the purchase
  description: string;
  merchant: string | null;
  amount: number;
  pending: boolean;
  bankCategory: string | null; // a Plaid category name, so your category rules apply
};

export type WalletEvent =
  | { kind: "transactions"; transactions: WalletTransaction[]; fromHistory: boolean }
  | { kind: "deleted"; walletTransactionId: string }
  | { kind: "account"; account: WalletAccount }
  | { kind: "account_removed"; walletAccountId: string }
  | { kind: "balance"; account: WalletAccount; balance: number; asOf: string | null }
  | { kind: "ignored"; reason: string };

export type Envelope = { id: string; type: string; test: boolean; data: unknown };

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max = 500) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const id = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_.:-]{1,200}$/.test(v) ? v : null);

function money(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

function accountType(v: unknown): "asset" | "liability" | null {
  return v === "asset" || v === "liability" ? v : null;
}

export function readEnvelope(body: unknown): Envelope | null {
  if (!isObject(body)) return null;
  const eventId = text(body.id, 100);
  const type = text(body.type, 100);
  if (!eventId || !type) return null;
  // Send Test and WalletFeed's samples arrive with livemode false.
  return { id: eventId, type, test: body.livemode === false, data: body.data };
}

// WalletFeed's own categories, in Plaid's words, so the category rules you
// set up for your banks sort these too.
const CATEGORY: Record<string, string> = {
  groceries: "FOOD_AND_DRINK_GROCERIES",
  dining: "FOOD_AND_DRINK_RESTAURANT",
  transport: "TRANSPORTATION_OTHER_TRANSPORTATION",
  fuel: "TRANSPORTATION_GAS",
  travel: "TRAVEL_OTHER_TRAVEL",
  shopping: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE",
  entertainment: "ENTERTAINMENT_OTHER_ENTERTAINMENT",
  subscriptions: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES",
  utilities: "RENT_AND_UTILITIES_OTHER_UTILITIES",
  health: "MEDICAL_OTHER_MEDICAL",
  services: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES",
};

// The kind of transaction decides first (a card payment isn't spending,
// interest on savings is income), then WalletFeed's category.
export function bankCategory(t: {
  type: string | null;
  category: string | null;
  amount: number;
  accountType: "asset" | "liability" | null;
}): string | null {
  const moneyIn = t.amount > 0;
  switch (t.type) {
    case "billPayment":
    case "loan":
      if (t.accountType === "liability" && moneyIn) return "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
      break;
    case "transfer":
    case "standingOrder":
    case "directDebit":
      if (t.accountType === "liability" && moneyIn) return "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
      return moneyIn ? "TRANSFER_IN_ACCOUNT_TRANSFER" : "TRANSFER_OUT_ACCOUNT_TRANSFER";
    case "deposit":
      if (t.accountType === "liability" && moneyIn) return "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT";
      if (moneyIn) return "TRANSFER_IN_DEPOSIT";
      break;
    case "atm":
    case "withdrawal":
      return "TRANSFER_OUT_WITHDRAWAL";
    case "interest":
      return moneyIn ? "INCOME_INTEREST_EARNED" : "BANK_FEES_INTEREST_CHARGE";
    case "dividend":
      return "INCOME_DIVIDENDS";
    case "directDeposit":
      return "INCOME_WAGES";
    case "fee":
      return "BANK_FEES_OTHER_BANK_FEES";
  }
  return (t.category && CATEGORY[t.category]) || null;
}

function readTransaction(v: unknown): WalletTransaction | null {
  if (!isObject(v)) return null;
  const walletTransactionId = id(v.id);
  const walletAccountId = id(v.account_id);
  const amount = money(v.amount);
  const when = text(v.transacted_at, 40) ?? text(v.posted_at, 40);
  const postedOn = easternDay(when);
  if (!walletTransactionId || !walletAccountId || amount === null || !postedOn) return null;

  const merchant = text(v.merchant_name, 200);
  const description = text(v.description) ?? merchant ?? text(v.original_description) ?? "Apple Wallet transaction";
  const type = accountType(v.account_type);
  return {
    walletTransactionId,
    walletAccountId,
    accountName: text(v.account_name, 200),
    accountType: type,
    postedOn,
    description,
    merchant,
    amount,
    pending: v.status === "pending",
    bankCategory: bankCategory({ type: text(v.type, 40), category: text(v.category, 40), amount, accountType: type }),
  };
}

function readAccount(v: Json, idField = "id"): WalletAccount | null {
  const walletAccountId = id(v[idField]);
  if (!walletAccountId) return null;
  return {
    walletAccountId,
    name: text(v.name ?? v.account_name, 200),
    institution: text(v.institution_name, 200),
    accountType: accountType(v.account_type),
  };
}

// A balance in this app's terms: what you owe on a card is a positive
// number, like Plaid's. WalletFeed sends Apple Card's balance as a negative
// number when you owe money.
export function appBalance(accountType: "asset" | "liability" | null, amount: number) {
  const value = accountType === "liability" ? -amount : amount;
  return Math.round(value * 100) / 100 || 0;
}

export function readEvent(envelope: Envelope): WalletEvent {
  const data = envelope.data;
  if (!isObject(data)) return { kind: "ignored", reason: "No data in the post" };

  switch (envelope.type) {
    case "transaction.created":
    case "transaction.updated": {
      const t = readTransaction(data);
      return t ? { kind: "transactions", transactions: [t], fromHistory: false } : { kind: "ignored", reason: "Transaction missing its id, amount or date" };
    }
    case "transaction.backfilled": {
      const list = Array.isArray(data.transactions) ? data.transactions : [];
      const transactions = list.map(readTransaction).filter((t): t is WalletTransaction => t !== null);
      return { kind: "transactions", transactions, fromHistory: data.source === "history" };
    }
    case "transaction.deleted": {
      const walletTransactionId = id(data.id);
      return walletTransactionId ? { kind: "deleted", walletTransactionId } : { kind: "ignored", reason: "Removal missing its id" };
    }
    case "account.added":
    case "account.updated": {
      const account = readAccount(data);
      return account ? { kind: "account", account } : { kind: "ignored", reason: "Account missing its id" };
    }
    case "account.removed": {
      const walletAccountId = id(data.id);
      return walletAccountId ? { kind: "account_removed", walletAccountId } : { kind: "ignored", reason: "Removal missing its id" };
    }
    case "balance.updated": {
      const account = readAccount(data, "account_id");
      const booked = isObject(data.booked) ? data.booked : isObject(data.available) ? data.available : null;
      const amount = booked ? money(booked.amount) : null;
      if (!account || amount === null) return { kind: "ignored", reason: "Balance missing its account or amount" };
      return { kind: "balance", account, balance: appBalance(account.accountType, amount), asOf: text(booked!.as_of, 40) };
    }
    default:
      return { kind: "ignored", reason: `Not used: ${envelope.type.slice(0, 60)}` };
  }
}
