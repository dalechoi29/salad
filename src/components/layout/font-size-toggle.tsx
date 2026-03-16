"use client";

import { useState, useEffect } from "react";
import { AArrowUp, AArrowDown, ALargeSmall } from "lucide-react";
import { cn } from "@/lib/utils";

type FontSize = "normal" | "large" | "small";
const CYCLE: FontSize[] = ["normal", "large", "small"];
const STORAGE_KEY = "salad_font_size";

export function FontSizeToggle() {
  const [size, setSize] = useState<FontSize>("normal");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSize | null;
    if (saved && CYCLE.includes(saved)) {
      setSize(saved);
      applySize(saved);
    }
  }, []);

  function applySize(s: FontSize) {
    const html = document.documentElement;
    html.classList.remove("font-size-normal", "font-size-large", "font-size-small");
    html.classList.add(`font-size-${s}`);
  }

  function toggle() {
    const nextIdx = (CYCLE.indexOf(size) + 1) % CYCLE.length;
    const next = CYCLE[nextIdx];
    setSize(next);
    applySize(next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  const Icon = size === "normal" ? ALargeSmall : size === "large" ? AArrowUp : AArrowDown;

  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md text-sm font-medium transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
      title={size === "normal" ? "글꼴 크게" : size === "large" ? "글꼴 작게" : "글꼴 보통"}
    >
      <Icon className="h-4 w-4" />
      <span className="sr-only">글꼴 크기 변경</span>
    </button>
  );
}
