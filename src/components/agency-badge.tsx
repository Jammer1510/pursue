import { shortAgency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AgencyBadge({ agency, className }: { agency: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-widest text-zinc-300",
        className
      )}
    >
      {shortAgency(agency)}
    </span>
  );
}
