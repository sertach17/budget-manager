import Link from "next/link";
import { ActiveTabInView } from "./active-tab";
import { SettingsMenu } from "./settings-menu";

const tabs = [
  { id: "dashboard", href: "/", label: "Dashboard" },
  { id: "transactions", href: "/transactions", label: "Transactions" },
  { id: "budget", href: "/budget", label: "Budget" },
  { id: "accounts", href: "/accounts", label: "Accounts" },
  { id: "goals", href: "/goals", label: "Goals" },
] as const;

export type TabId = (typeof tabs)[number]["id"];

// Simple outline icons for the bottom tabs, 24 by 24.
const icons: Record<TabId, string> = {
  dashboard: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  transactions: "M4 6h16M4 12h16M4 18h10",
  budget: "M12 3a9 9 0 1 0 9 9h-9z M14 3.2A9 9 0 0 1 20.8 10H14z",
  accounts: "M3 9l9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18",
  goals: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 12h.01",
};

// Top of every signed-in page: the name, the three-line settings menu, and
// tabs that open each page. The demo passes `demo` so every link stays
// inside /demo.
//
// In a browser the tabs sit under the name. Opened from the iPhone home
// screen icon, they move to a bar at the bottom of the screen instead,
// where a thumb reaches them.
export function AppHeader({ active, demo = false }: { active?: TabId; demo?: boolean }) {
  const base = demo ? "/demo" : "";
  const hrefFor = (href: string) => (href === "/" ? base || "/" : `${base}${href}`);
  return (
    <header className="animate-fade">
      <div className="flex items-center justify-between gap-4">
        <Link href={base || "/"} className="pressable flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br from-violet-500 via-sky-500 to-emerald-400 shadow-lg shadow-violet-500/25"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d={icons.budget} />
            </svg>
          </span>
          <span className="text-xl font-semibold tracking-tight">
            Budget <span className="text-white/45">Manager</span>
          </span>
        </Link>
        <SettingsMenu demo={demo} />
      </div>
      <nav aria-label="Pages" className="-mx-4 mt-5 overflow-x-auto px-4 [scrollbar-width:none] standalone:hidden">
        <ul className="flex w-max gap-1 rounded-full border border-line bg-white/[0.03] p-1">
          {tabs.map((tab) => {
            const current = tab.id === active;
            return (
              <li key={tab.id}>
                <Link
                  href={hrefFor(tab.href)}
                  aria-current={current ? "page" : undefined}
                  className={`pressable block rounded-full px-4 py-1.5 text-sm font-medium ${
                    current ? "btn-primary" : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <ActiveTabInView />
      </nav>
      <nav
        aria-label="Pages"
        className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-line bg-[#0e111b]/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl standalone:block"
      >
        <ul className="mx-auto flex max-w-xl">
          {tabs.map((tab) => {
            const current = tab.id === active;
            return (
              <li key={tab.id} className="flex-1">
                <Link
                  href={hrefFor(tab.href)}
                  aria-current={current ? "page" : undefined}
                  className={`pressable flex flex-col items-center gap-1 pb-1.5 pt-2 text-[10px] font-medium ${
                    current ? "text-emerald-400" : "text-white/50"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className={`h-6 w-6 transition-transform duration-200 ${current ? "-translate-y-0.5" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={current ? 2.2 : 1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={icons[tab.id]} />
                  </svg>
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
