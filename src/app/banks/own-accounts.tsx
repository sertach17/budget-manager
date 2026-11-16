"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  addOwnAccount,
  deleteOwnAccount,
  updateOwnAccount,
  type OwnAccountInput,
  type OwnAccountResult,
} from "./own-account-actions";

export type OwnAccount = {
  id: string;
  name: string;
  institution: string | null;
  type: string;
  mask: string | null;
  balance: number | null;
  transactionCount: number;
};

type Handlers = {
  onAdd?: (input: OwnAccountInput) => Promise<OwnAccountResult>;
  onUpdate?: (id: string, input: OwnAccountInput) => Promise<OwnAccountResult>;
  onDelete?: (id: string) => Promise<OwnAccountResult>;
};

const input = "w-full rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20 dark:bg-neutral-900";
const primary = "rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-emerald-500";
const plain = "rounded-lg border border-black/15 px-3 py-2 text-sm disabled:opacity-50 dark:border-white/20";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const TYPE_LABEL: Record<string, string> = {
  credit: "Credit card",
  checking: "Checking",
  savings: "Savings",
  cash: "Cash (like Apple Cash)",
  investment: "Investment",
  loan: "Loan",
  other: "Other",
};

const owes = (type: string) => type === "credit" || type === "loan";

function Message({ result }: { result: OwnAccountResult | null }) {
  if (!result) return null;
  return (
    <p className={`text-xs ${result.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>{result.message}</p>
  );
}

function Fields({ value, onChange }: { value: OwnAccountInput; onChange: (v: OwnAccountInput) => void }) {
  const set = (key: keyof OwnAccountInput) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Name</span>
        <input value={value.name} onChange={set("name")} required maxLength={100} placeholder="Apple Card" className={input} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Kind</span>
        <select value={value.type} onChange={set("type")} className={input}>
          {Object.entries(TYPE_LABEL).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Bank or company (optional)</span>
        <input value={value.institution} onChange={set("institution")} maxLength={100} placeholder="Apple" className={input} />
      </label>
      <label className="text-sm">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">Last digits (optional)</span>
        <input value={value.mask} onChange={set("mask")} inputMode="numeric" maxLength={4} placeholder="1234" className={input} />
      </label>
      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-xs text-black/60 dark:text-white/60">
          {owes(value.type) ? "Amount you owe right now" : "Balance right now"}
        </span>
        <input value={value.balance} onChange={set("balance")} inputMode="decimal" placeholder="0.00" className={input} />
        <span className="mt-1 block text-xs text-black/50 dark:text-white/50">
          Transactions you add dated after today change it by themselves. Type a new one here anytime to correct it.
        </span>
      </label>
    </div>
  );
}

const EMPTY: OwnAccountInput = { name: "", institution: "", type: "credit", mask: "", balance: "" };

function AccountItem({ account, base, onUpdate, onDelete }: { account: OwnAccount; base: string } & Handlers) {
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [value, setValue] = useState<OwnAccountInput>({
    name: account.name,
    institution: account.institution ?? "",
    type: account.type,
    mask: account.mask ?? "",
    balance: account.balance === null ? "" : String(account.balance),
  });
  const [result, setResult] = useState<OwnAccountResult | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const r = await (onUpdate ?? updateOwnAccount)(account.id, value);
      setResult(r);
      if (r.ok) setMode("view");
    });
  const remove = () =>
    start(async () => {
      const r = await (onDelete ?? deleteOwnAccount)(account.id);
      setResult(r);
      if (!r.ok) setMode("view");
    });

  return (
    <li className="py-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">
            {account.name}
            {account.mask ? ` ···${account.mask}` : ""}
          </p>
          <p className="truncate text-xs text-black/50 dark:text-white/50">
            {TYPE_LABEL[account.type] ?? account.type}
            {account.institution ? ` · ${account.institution}` : ""} · {account.transactionCount}{" "}
            {account.transactionCount === 1 ? "transaction" : "transactions"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="tabular-nums">
            {account.balance === null ? "" : `${money.format(account.balance)}${owes(account.type) ? " owed" : ""}`}
          </span>
          {mode === "view" ? (
            <>
              <Link
                href={`${base}/upload?account=${encodeURIComponent(account.id)}`}
                className="rounded-lg bg-emerald-600 px-2 py-1 text-xs font-medium text-white dark:bg-emerald-500"
              >
                Upload
              </Link>
              <button type="button" onClick={() => setMode("edit")} className="rounded-lg border border-black/15 px-2 py-1 text-xs dark:border-white/20">
                Edit
              </button>
              <button
                type="button"
                onClick={() => setMode("confirm")}
                className="rounded-lg border border-red-300 px-2 py-1 text-xs text-red-700 dark:border-red-500/40 dark:text-red-300"
              >
                Delete
              </button>
            </>
          ) : null}
        </div>
      </div>
      {mode === "edit" ? (
        <div className="mt-3 grid gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
          <Fields value={value} onChange={setValue} />
          <div className="flex items-center gap-3">
            <button type="button" onClick={save} disabled={pending} className={primary}>
              {pending ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setMode("view")} className={plain}>
              Close
            </button>
          </div>
        </div>
      ) : null}
      {mode === "confirm" ? (
        <div className="mt-3 rounded-xl bg-red-50 p-3 text-red-900 dark:bg-red-500/10 dark:text-red-200">
          <p className="font-medium">Do you really want to delete {account.name}?</p>
          <p className="mt-1 text-xs">
            {account.transactionCount
              ? `Its ${account.transactionCount} ${account.transactionCount === 1 ? "transaction goes" : "transactions go"} too, and this can't be undone.`
              : "This can't be undone."}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={remove} disabled={pending} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
              {pending ? "Deleting…" : "Yes, delete"}
            </button>
            <button type="button" onClick={() => setMode("view")} className={plain}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <div className="mt-1">
        <Message result={result} />
      </div>
    </li>
  );
}

// "Your own accounts" on the Banks page. The demo passes handlers that keep
// changes in the page; the signed-in site saves them.
export function OwnAccounts({
  accounts,
  base = "",
  onAdd,
  onUpdate,
  onDelete,
}: { accounts: OwnAccount[]; base?: string } & Handlers) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<OwnAccountInput>(EMPTY);
  const [result, setResult] = useState<OwnAccountResult | null>(null);
  const [pending, start] = useTransition();

  const add = () =>
    start(async () => {
      const r = await (onAdd ?? addOwnAccount)(value);
      setResult(r);
      if (r.ok) {
        setValue(EMPTY);
        setOpen(false);
      }
    });

  return (
    <section className="mt-10 rounded-2xl border border-black/10 p-4 dark:border-white/15">
      <p className="font-medium">Your own accounts</p>
      <p className="text-xs text-black/50 dark:text-white/50">
        For accounts no bank link reaches, like Apple Card or Apple Cash. Tap Upload to add a statement file to one.
      </p>
      {accounts.length ? (
        <ul className="mt-3 divide-y divide-black/10 dark:divide-white/10">
          {accounts.map((a) => (
            <AccountItem key={a.id} account={a} base={base} onUpdate={onUpdate} onDelete={onDelete} />
          ))}
        </ul>
      ) : null}
      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          className="mt-4 grid gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15"
        >
          <Fields value={value} onChange={setValue} />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className={primary}>
              {pending ? "Adding…" : "Add account"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={plain}>
              Close
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`mt-4 ${primary}`}>
          + Add an account
        </button>
      )}
      <div className="mt-2">
        <Message result={result} />
      </div>
    </section>
  );
}
