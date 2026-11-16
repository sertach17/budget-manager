import Link from "next/link";
import type { Account } from "@/lib/budget/types";

// Your accounts with their balances. Tap one to see its transactions.
// Shared by the signed-in Accounts page and the demo.

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function AccountsList({ accounts, base = "" }: { accounts: Account[]; base?: string }) {
  return (
    <ul className="divide-y divide-black/10 rounded-2xl border border-black/10 dark:divide-white/10 dark:border-white/15">
      {accounts.map((account) => (
        <li key={account.id}>
          <Link
            href={`${base}/accounts/${encodeURIComponent(account.id)}`}
            className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{account.name}</p>
              <p className="truncate text-xs text-black/50 dark:text-white/50">
                {account.institution}
                {account.mask ? ` ···${account.mask}` : ""}
              </p>
            </div>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              {account.type === "credit" || account.type === "loan"
                ? `${money.format(account.currentBalance)} owed`
                : money.format(account.currentBalance)}
              <span aria-hidden="true" className="text-black/40 dark:text-white/40">
                ›
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function AccountsFooter({ base = "" }: { base?: string }) {
  return (
    <p className="mt-4 text-xs text-black/50 dark:text-white/50">
      Connect a bank or add one of your own on the{" "}
      <Link href={`${base}/banks`} className="underline">
        Banks
      </Link>{" "}
      page.
    </p>
  );
}
