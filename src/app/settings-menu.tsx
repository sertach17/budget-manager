"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "./actions";

const links = [
  { href: "/banks", label: "Banks" },
  { href: "/categories", label: "Categories" },
  { href: "/account/password", label: "Change password" },
];

const itemClass = "block w-full px-4 py-2.5 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10";

// The three-line button in the corner of the home page. It opens your
// settings, with Sign out at the end.
export function SettingsMenu() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls="settings-menu"
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-10 items-center justify-center rounded-lg border border-black/15 dark:border-white/20"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          id="settings-menu"
          className="absolute right-0 z-10 mt-2 w-56 overflow-hidden rounded-xl border border-black/10 bg-white py-1 shadow-lg dark:border-white/15 dark:bg-neutral-900"
        >
          <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
            Settings
          </p>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={itemClass} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <div className="my-1 border-t border-black/10 dark:border-white/15" />
          <form action={signOut}>
            <button type="submit" className={`${itemClass} text-red-600 dark:text-red-400`}>
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
