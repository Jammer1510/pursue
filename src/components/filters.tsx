"use client";

import type { EventFilters } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

export function Filters({
  agencies,
  documentTypes,
  value,
  onChange,
  count,
  total,
}: {
  agencies: string[];
  documentTypes: string[];
  value: EventFilters;
  onChange: (v: EventFilters) => void;
  count: number;
  total: number;
}) {
  const setField = <K extends keyof EventFilters>(k: K, v: EventFilters[K]) =>
    onChange({ ...value, [k]: v });
  const toggleArrayField = (k: "agencies" | "documentTypes", item: string) => {
    const cur = value[k] ?? [];
    const next = cur.includes(item) ? cur.filter((x) => x !== item) : [...cur, item];
    setField(k, next);
  };
  const bustMin = value.bustMin ?? 0;
  const bustMax = value.bustMax ?? 100;

  return (
    <aside className="w-64 shrink-0 space-y-5 border-r border-zinc-800 bg-zinc-950 p-4">
      <div>
        <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Search ({count} / {total})
        </label>
        <Input
          value={value.search ?? ""}
          placeholder="title, summary, claims…"
          onChange={(e) => setField("search", e.target.value || undefined)}
          className="border-zinc-700 bg-zinc-900 font-mono text-xs"
        />
      </div>

      <FilterGroup
        label="Agency"
        items={agencies}
        selected={value.agencies ?? []}
        onToggle={(s) => toggleArrayField("agencies", s)}
      />

      <FilterGroup
        label="Document type"
        items={documentTypes}
        selected={value.documentTypes ?? []}
        onToggle={(s) => toggleArrayField("documentTypes", s)}
      />

      <div>
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Year range
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={value.yearMin ?? ""}
            placeholder="1947"
            onChange={(e) => setField("yearMin", e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="border-zinc-700 bg-zinc-900 font-mono text-xs"
          />
          <span className="text-zinc-600">–</span>
          <Input
            type="number"
            value={value.yearMax ?? ""}
            placeholder="2026"
            onChange={(e) => setField("yearMax", e.target.value ? parseInt(e.target.value, 10) : undefined)}
            className="border-zinc-700 bg-zinc-900 font-mono text-xs"
          />
        </div>
      </div>

      <div>
        <label className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          Bust score: {bustMin}–{bustMax}
        </label>
        <Slider
          min={0}
          max={100}
          step={5}
          value={[bustMin, bustMax]}
          onValueChange={(v: number | readonly number[]) => {
            const arr = Array.isArray(v) ? v : [v, v];
            onChange({ ...value, bustMin: arr[0], bustMax: arr[1] });
          }}
          className="mt-2"
        />
        <p className="mt-1 font-mono text-[10px] text-zinc-600">
          0 = weird · 100 = mundane (null always shown)
        </p>
      </div>

      <button
        onClick={() => onChange({})}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
      >
        Reset filters
      </button>
    </aside>
  );
}

function FilterGroup({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: string[];
  selected: string[];
  onToggle: (s: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</label>
      <div className="flex flex-wrap gap-1">
        {items.map((it) => {
          const on = selected.includes(it);
          return (
            <button
              key={it}
              onClick={() => onToggle(it)}
              className={
                "rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide transition-colors " +
                (on
                  ? "border-zinc-300 bg-zinc-200 text-zinc-900"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200")
              }
            >
              {it}
            </button>
          );
        })}
      </div>
    </div>
  );
}
