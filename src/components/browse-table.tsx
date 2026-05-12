"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventFilters, EventSummary } from "@/lib/types";
import {
  createEventSearchIndex,
  filterEventsClient,
  type EventSearchDocument,
} from "@/lib/search";
import { Filters } from "./filters";
import { EventCard } from "./event-card";
import { EventDetailPanel } from "./event-detail-panel";
import { BustPill } from "./bust-pill";
import { AgencyBadge } from "./agency-badge";
import { formatDate } from "@/lib/format";
import { useLocale } from "./locale-provider";
import { pickField } from "@/lib/i18n";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent } from "@/components/ui/sheet";

export function BrowseTable({
  initial,
  agencies,
  documentTypes,
  total,
}: {
  initial: EventSummary[];
  agencies: string[];
  documentTypes: string[];
  total: number;
}) {
  const [filters, setFilters] = useState<EventFilters>({});
  const [searchDocs, setSearchDocs] = useState<EventSearchDocument[] | null>(null);
  const canSyncUrl = useRef(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { locale } = useLocale();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next: EventFilters = {};
    const agencies = params.get("agencies");
    if (agencies) next.agencies = agencies.split(",").filter(Boolean);
    const documentTypes = params.get("documentTypes");
    if (documentTypes) next.documentTypes = documentTypes.split(",").filter(Boolean);
    const yearMin = params.get("yearMin");
    if (yearMin) next.yearMin = parseInt(yearMin, 10);
    const yearMax = params.get("yearMax");
    if (yearMax) next.yearMax = parseInt(yearMax, 10);
    const bustMin = params.get("bustMin");
    if (bustMin) next.bustMin = parseInt(bustMin, 10);
    const bustMax = params.get("bustMax");
    if (bustMax) next.bustMax = parseInt(bustMax, 10);
    const search = params.get("search");
    if (search) next.search = search;
    const eventParam = params.get("event");
    if (eventParam) {
      const id = parseInt(eventParam, 10);
      if (Number.isFinite(id)) setSelectedId(id);
    }
    window.setTimeout(() => {
      setFilters(next);
      canSyncUrl.current = true;
    }, 0);
  }, []);

  const handleClose = () => {
    setSelectedId(null);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("event")) return;
    url.searchParams.delete("event");
    const qs = url.searchParams.toString();
    window.history.replaceState(null, "", qs ? `${url.pathname}?${qs}` : url.pathname);
  };

  useEffect(() => {
    fetch("/data/search.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`search index ${r.status}`))))
      .then((docs: EventSearchDocument[]) => setSearchDocs(docs))
      .catch(() => setSearchDocs([]));
  }, []);

  useEffect(() => {
    if (!canSyncUrl.current) return;
    const qs = new URLSearchParams();
    if (filters.agencies?.length) qs.set("agencies", filters.agencies.join(","));
    if (filters.documentTypes?.length) qs.set("documentTypes", filters.documentTypes.join(","));
    if (typeof filters.yearMin === "number") qs.set("yearMin", String(filters.yearMin));
    if (typeof filters.yearMax === "number") qs.set("yearMax", String(filters.yearMax));
    if (typeof filters.bustMin === "number" && filters.bustMin > 0) qs.set("bustMin", String(filters.bustMin));
    if (typeof filters.bustMax === "number" && filters.bustMax < 100) qs.set("bustMax", String(filters.bustMax));
    if (filters.search) qs.set("search", filters.search);
    const next = qs.toString() ? `${window.location.pathname}?${qs.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [filters]);

  const searchIndex = useMemo(
    () => (searchDocs && searchDocs.length > 0 ? createEventSearchIndex(searchDocs) : null),
    [searchDocs]
  );

  const rows = useMemo(() => filterEventsClient(initial, filters, searchIndex), [initial, filters, searchIndex]);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.agencies?.length) n += filters.agencies.length;
    if (filters.documentTypes?.length) n += filters.documentTypes.length;
    if (typeof filters.yearMin === "number") n += 1;
    if (typeof filters.yearMax === "number") n += 1;
    if (typeof filters.bustMin === "number" && filters.bustMin > 0) n += 1;
    if (typeof filters.bustMax === "number" && filters.bustMax < 100) n += 1;
    if (filters.search) n += 1;
    return n;
  }, [filters]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col md:flex-row">
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        <Filters
          agencies={agencies}
          documentTypes={documentTypes}
          value={filters}
          onChange={setFilters}
          count={rows.length}
          total={total}
        />
      </div>

      {/* Mobile toolbar */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2 md:hidden">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-zinc-300 hover:border-zinc-500"
        >
          Filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
        <span className="font-mono text-[11px] text-zinc-500">{rows.length} / {total}</span>
      </div>

      {/* Mobile filter Sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="left"
          className="w-[85vw] overflow-y-auto border-zinc-800 bg-zinc-950 p-0 text-zinc-200 sm:!max-w-sm"
        >
          <Filters
            agencies={agencies}
            documentTypes={documentTypes}
            value={filters}
            onChange={setFilters}
            count={rows.length}
            total={total}
          />
        </SheetContent>
      </Sheet>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {/* Mobile card stack */}
        <div className="grid grid-cols-1 gap-2 p-3 md:hidden">
          {rows.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              onClick={() => {
                setFiltersOpen(false);
                setSelectedId(e.id);
              }}
              fullWidth
            />
          ))}
          {rows.length === 0 && (
            <div className="py-12 text-center font-mono text-xs text-zinc-500">no matches</div>
          )}
        </div>

        {/* Desktop table */}
        <Table className="hidden md:table">
          <TableHeader>
            <TableRow className="border-zinc-800 hover:bg-transparent">
              <TableHead className="w-32 font-mono text-[10px] uppercase">Date</TableHead>
              <TableHead className="w-24 font-mono text-[10px] uppercase">Agency</TableHead>
              <TableHead className="font-mono text-[10px] uppercase">Title</TableHead>
              <TableHead className="w-40 font-mono text-[10px] uppercase">Location</TableHead>
              <TableHead className="w-32 font-mono text-[10px] uppercase">Type</TableHead>
              <TableHead className="w-32 font-mono text-[10px] uppercase">Bust</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow
                key={e.id}
                onClick={() => setSelectedId(e.id)}
                className="cursor-pointer border-zinc-800 hover:bg-zinc-900"
              >
                <TableCell className="font-mono text-xs text-zinc-400">{formatDate(e)}</TableCell>
                <TableCell><AgencyBadge agency={e.agency} /></TableCell>
                <TableCell className="font-mono text-xs text-zinc-100">
                  {pickField(e, "title", locale) || e.folder_name}
                </TableCell>
                <TableCell className="font-mono text-xs text-zinc-400">{pickField(e, "incident_location", locale) ?? "—"}</TableCell>
                <TableCell className="font-mono text-[10px] uppercase text-zinc-500">{e.document_type ?? "—"}</TableCell>
                <TableCell><BustPill score={e.bust_score} /></TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-12 text-center font-mono text-xs text-zinc-500">
                  no matches
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <EventDetailPanel selectedId={selectedId} onClose={handleClose} />
    </div>
  );
}
