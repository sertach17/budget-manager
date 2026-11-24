"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signOut } from "./actions";

const links = [
  { href: "/banks", label: "Banks" },
  { href: "/alerts", label: "Phone alerts" },
  { href: "/categories", label: "Categories" },
  { href: "/agents", label: "Connected agents" },
  { href: "/account/password", label: "Change password" },
];

const itemClass = "block w-full px-4 py-3 text-left text-[15px] hover:bg-white/[0.06]";

const demoLinks = [
  { href: "/demo/banks", label: "Banks" },
  { href: "/demo/alerts", label: "Phone alerts" },
  { href: "/demo/categories", label: "Categories" },
  { href: "/demo/agents", label: "Connected agents" },
];

// The three-line button in the corner of the home page. It opens your
// settings, with Sign out at the end. In the demo the links stay inside
// /demo, Change password is off and Leave demo takes Sign out's place.
export function SettingsMenu({ demo = false }: { demo?: boolean }) {
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
        className="pressable flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white/[0.04] text-white/80 hover:bg-white/[0.08]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div
          id="settings-menu"
          className="absolute right-0 z-50 mt-2 w-60 origin-top-right animate-rise overflow-hidden rounded-2xl border border-line bg-[#171b2b]/95 py-1 shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <p className="px-4 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-black/50 dark:text-white/50">
            Settings
          </p>
          {(demo ? demoLinks : links).map((l) => (
            <Link key={l.href} href={l.href} className={itemClass} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          {demo ? (
            <p className={`${itemClass} cursor-default text-black/40 hover:bg-transparent dark:text-white/40 dark:hover:bg-transparent`}>
              Change password (off in the demo)
            </p>
          ) : null}
          <div className="my-1 border-t border-black/10 dark:border-white/10" />
          {demo ? (
            <Link href="/login" className={`${itemClass} text-red-600 dark:text-red-400`}>
              Leave demo
            </Link>
          ) : (
            <form action={signOut}>
              <button type="submit" className={`${itemClass} text-red-600 dark:text-red-400`}>
                Sign out
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
