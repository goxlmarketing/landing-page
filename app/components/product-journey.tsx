"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const STEPS = 4;

export function ProductJourney({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const section = root.closest(".product");
    if (!section) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      root.setAttribute("data-reduced", "1");
      return;
    }

    const update = () => {
      const rect = section.getBoundingClientRect();
      const view = window.innerHeight || 1;
      const start = view * 0.55;
      const end = view * 0.2;
      const raw = (start - rect.top) / (start - end + rect.height * 0.35);
      const t = Math.min(1, Math.max(0, raw));
      const next = Math.min(STEPS - 1, Math.floor(t * STEPS));
      setActive(next);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="product-journey"
      data-active={active}
      style={{ ["--active-step" as string]: active }}
    >
      {children}
    </div>
  );
}
