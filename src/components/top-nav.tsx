"use client";

import Link from "next/link";
import { useLocale } from "./locale-provider";
import { LocaleToggle } from "./locale-toggle";
import { t } from "@/lib/i18n";

export function TopNav() {
  const { locale } = useLocale();
  return (
    <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-2 backdrop-blur sm:px-4">
      <Link href="/" className="font-mono text-sm font-bold tracking-widest text-zinc-100 hover:text-zinc-300">
        <span className="sm:hidden">PURSUE</span>
        <span className="hidden sm:inline">
          PURSUE<span className="text-emerald-400">.</span>ARCHIVE
        </span>
      </Link>
      <nav className="flex items-center gap-0 sm:gap-1">
        <NavLink href="/" label={t("nav.timeline", locale)} />
        <NavLink href="/browse" label={t("nav.browse", locale)} />
        <NavLink href="/map" label={t("nav.map", locale)} />
        <NavLink href="/connections" label={t("nav.connections", locale)} />
      </nav>
      <div className="flex items-center gap-2 sm:gap-3">
        <LocaleToggle />
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-zinc-600 sm:inline-block">
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
      className="rounded px-1.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100 sm:px-3 sm:text-xs"
    >
      {label}
    </Link>
  );
}
