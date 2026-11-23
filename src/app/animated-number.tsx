"use client";

import { useLayoutEffect, useRef } from "react";

const wholeMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// A dollar amount that glides to its new value when it changes, such as when
// a transaction moves to another category. It shows the value straight away
// on first load, and jumps without gliding when the phone asks for less motion.
export function AnimatedMoney({ value, className }: { value: number; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const from = useRef(value);

  useLayoutEffect(() => {
    const start = from.current;
    from.current = value;
    const node = el.current;
    if (!node || start === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const began = performance.now();
    const duration = 600;
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min((now - began) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      node.textContent = wholeMoney.format(Math.round(start + (value - start) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    node.textContent = wholeMoney.format(Math.round(start));
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      node.textContent = wholeMoney.format(value);
    };
  }, [value]);

  return (
    <span ref={el} className={className}>
      {wholeMoney.format(value)}
    </span>
  );
}
