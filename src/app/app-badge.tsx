"use client";

import { useEffect } from "react";

// The number on the Budget icon on the home screen: how many transactions
// wait for review. Set whenever the dashboard loads, so marking things
// reviewed lowers it and it goes away at zero. Phone alerts set it too when
// new transactions come in. iPhones only show it once alerts are allowed.
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!nav.setAppBadge || !nav.clearAppBadge) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    (count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()).catch(() => {});
  }, [count]);
  return null;
}
