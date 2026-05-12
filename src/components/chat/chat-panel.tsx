"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { XIcon } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { useChat } from "./use-chat";
import { ChatMessage } from "./chat-message";

const SUGGESTED_KEYS = [
  "chat.suggested.1",
  "chat.suggested.2",
  "chat.suggested.3",
  "chat.suggested.4",
] as const;

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useLocale();
  const { messages, sending, error, send, clear } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, messages.length]);

  async function handleSend(text: string) {
    const value = text.trim();
    if (!value || sending) return;
    setInput("");
    await send(value);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend(input);
    }
  }

  const errorMessage =
    error === "rate"
      ? t("chat.error.rate", locale)
      : error === "config"
        ? t("chat.error.config", locale)
        : error === "network"
          ? t("chat.error.network", locale)
          : error === "generic"
            ? t("chat.error.generic", locale)
            : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex h-full w-full flex-col border-zinc-800 bg-zinc-950 text-zinc-200 sm:!max-w-[400px]"
      >
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {t("chat.title", locale)}
          </span>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-zinc-200"
              >
                {t("chat.clear", locale)}
              </button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close chat"
              className="text-zinc-400 hover:text-zinc-100"
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col gap-4">
              <p className="text-sm text-zinc-400">{t("chat.empty", locale)}</p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_KEYS.map((key) => {
                  const text = t(key, locale);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => void handleSend(text)}
                      className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left text-xs text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900"
                    >
                      {text}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {messages.map((m, i) => (
                <ChatMessage key={i} turn={m} />
              ))}
              {sending && messages[messages.length - 1]?.content === "" && (
                <span className="self-start font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {t("chat.thinking", locale)}
                </span>
              )}
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="border-t border-rose-900/60 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend(input);
          }}
          className="shrink-0 border-t border-zinc-800 px-3 py-3"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              maxLength={2000}
              placeholder={t("chat.placeholder", locale)}
              aria-label={t("chat.placeholder", locale)}
              className="flex-1 resize-none rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
              disabled={sending}
            />
            <Button
              type="submit"
              size="sm"
              disabled={sending || !input.trim()}
              className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
            >
              {t("chat.send", locale)}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
