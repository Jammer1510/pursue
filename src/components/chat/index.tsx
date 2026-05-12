"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";

const ChatPanel = dynamic(() => import("./chat-panel").then((m) => m.ChatPanel), {
  ssr: false,
});

export function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const { locale } = useLocale();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("chat.open", locale)}
        className="fixed bottom-4 right-4 z-[1050] flex h-12 w-12 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 font-mono text-lg text-zinc-200 shadow-lg transition hover:border-zinc-500 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500"
      >
        <span aria-hidden>›</span>
      </button>
      {open && <ChatPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
