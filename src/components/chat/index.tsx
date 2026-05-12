"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MessageCircleIcon } from "lucide-react";
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
        className="fixed bottom-4 right-4 z-[1050] flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-xs font-medium text-zinc-200 shadow-lg transition hover:border-zinc-500 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-500"
      >
        <MessageCircleIcon className="h-4 w-4" />
        <span>{t("chat.open", locale)}</span>
      </button>
      {open && <ChatPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
