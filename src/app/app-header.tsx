import Link from "next/link";
import { SettingsMenu } from "./settings-menu";

const tabs = [
  { id: "dashboard", href: "/", label: "Dashboard" },
  { id: "transactions", href: "/transactions", label: "Transactions" },
  { id: "categories", href: "/categories", label: "Categories" },
] as const;

export type TabId = (typeof tabs)[number]["id"];

// Top of every signed-in page: the name, the three-line settings menu, and
// tabs that open each page.
export function AppHeader({ active }: { active?: TabId }) {
  return (
    <header>
      <div className="flex items-center justify-between gap-4">
        <Link href="/" className="text-2xl font-semibold">
          Budget Manager
        </Link>
        <SettingsMenu />
      </div>
      <nav aria-label="Pages" className="-mx-4 mt-5 overflow-x-auto px-4">
        <ul className="flex w-max gap-2">
          {tabs.map((tab) => {
            const current = tab.id === active;
            return (
              <li key={tab.id}>
                <Link
                  href={tab.href}
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
