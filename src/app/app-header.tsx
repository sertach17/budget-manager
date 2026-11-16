import Link from "next/link";
import { SettingsMenu } from "./settings-menu";

const tabs = [
  { id: "dashboard", href: "/", label: "Dashboard" },
  { id: "transactions", href: "/transactions", label: "Transactions" },
  { id: "budget", href: "/budget", label: "Budget" },
  { id: "accounts", href: "/accounts", label: "Accounts" },
  { id: "goals", href: "/goals", label: "Goals" },
] as const;

export type TabId = (typeof tabs)[number]["id"];

// Top of every signed-in page: the name, the three-line settings menu, and
// tabs that open each page. The demo passes `demo` so every link stays
// inside /demo.
export function AppHeader({ active, demo = false }: { active?: TabId; demo?: boolean }) {
  const base = demo ? "/demo" : "";
  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <Link href={base || "/"} className="text-2xl font-semibold">
          Budget Manager
        </Link>
        <SettingsMenu demo={demo} />
      </div>
      <nav aria-label="Pages" className="-mx-4 mt-5 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {tabs.map((tab) => {
            const current = tab.id === active;
            return (
              <li key={tab.id}>
                <Link
                  href={tab.href === "/" ? base || "/" : `${base}${tab.href}`}
                  aria-current={current ? "page" : undefined}
                  className={`block rounded-full px-4 py-1.5 text-sm font-medium ${
                    current
                      ? "bg-emerald-600 text-white"
                      : "text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
