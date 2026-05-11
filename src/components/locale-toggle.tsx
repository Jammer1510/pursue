"use client";

import { useLocale } from "./locale-provider";
import { cn } from "@/lib/utils";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center gap-px rounded border border-zinc-800 bg-zinc-900 p-0.5 font-mono text-[10px] uppercase tracking-widest">
      <button
        type="button"
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        className={cn(
          "rounded px-2 py-0.5 transition-colors",
          locale === "en"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-200"
        )}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLocale("zh")}
        aria-pressed={locale === "zh"}
        className={cn(
          "rounded px-2 py-0.5 transition-colors",
          locale === "zh"
            ? "bg-zinc-700 text-zinc-100"
            : "text-zinc-500 hover:text-zinc-200"
        )}
      >
        中文
      </button>
    </div>
  );
}
