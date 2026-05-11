"use client";

import { coverUpClasses } from "@/lib/format";
import { useLocale } from "./locale-provider";
import { cn } from "@/lib/utils";

export function CoverUpPill({ score, className }: { score: number | null; className?: string }) {
  const { locale } = useLocale();
  const c = coverUpClasses(score, locale);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs uppercase tracking-wide",
        c.text,
        c.bg,
        c.border,
        className
      )}
      title={score == null ? "Cover-up assessment not applicable" : `Cover-up score ${score}/100`}
    >
      {c.label}
    </span>
  );
}
