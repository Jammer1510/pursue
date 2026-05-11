"use client";

import Link from "next/link";
import { useLocale } from "./locale-provider";
import { LocaleToggle } from "./locale-toggle";
import { t } from "@/lib/i18n";

export function TopNav() {
  const { locale } = useLocale();
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-950/80 px-4 backdrop-blur">
      <Link href="/" className="font-mono text-sm font-bold tracking-widest text-zinc-100 hover:text-zinc-300">
        PURSUE<span className="text-emerald-400">.</span>ARCHIVE
      </Link>
      <nav className="flex items-center gap-1">
        <NavLink href="/" label={t("nav.timeline", locale)} />
        <NavLink href="/browse" label={t("nav.browse", locale)} />
        <NavLink href="/map" label={t("nav.map", locale)} />
        <NavLink href="/connections" label={t("nav.connections", locale)} />
      </nav>
      <div className="flex items-center gap-3">
        <LocaleToggle />
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
          local · v0
        </span>
      </div>
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded px-3 py-1.5 font-mono text-xs uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
    >
      {label}
    </Link>
  );
}
