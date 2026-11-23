"use client";

import { useEffect, useRef } from "react";

// On a narrow screen the tab row scrolls sideways. This brings the current
// page's tab into view, so Accounts or Goals isn't hidden off the edge.
export function ActiveTabInView() {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const nav = marker.current?.closest("nav");
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const left = current.offsetLeft - (nav.clientWidth - current.offsetWidth) / 2;
    nav.scrollLeft = Math.max(left, 0);
  }, []);
  return <span ref={marker} hidden />;
}
