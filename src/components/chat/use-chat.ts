"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ChatTurn {
  role: "user" | "model";
  content: string;
}

const STORAGE_KEY = "pursue.chat.history";

type ErrorKind = "rate" | "config" | "network" | "generic" | null;

interface State {
  messages: ChatTurn[];
  sending: boolean;
  error: ErrorKind;
}

function loadHistory(): ChatTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is ChatTurn =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "model") &&
        typeof m.content === "string",
    );
  } catch {
    return [];
  }
}

function saveHistory(messages: ChatTurn[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // private mode / quota — silent
  }
}

export interface UseChat {
  messages: ChatTurn[];
  sending: boolean;
  error: ErrorKind;
  send: (text: string) => Promise<void>;
  clear: () => void;
}

export function useChat(): UseChat {
  const [state, setState] = useState<State>({ messages: [], sending: false, error: null });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setState((s) => ({ ...s, messages: loadHistory() }));
  }, []);

  useEffect(() => {
    saveHistory(state.messages);
  }, [state.messages]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ messages: [], sending: false, error: null });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userTurn: ChatTurn = { role: "user", content: trimmed };
      const placeholder: ChatTurn = { role: "model", content: "" };

      setState((prev) => ({
        messages: [...prev.messages, userTurn, placeholder],
        sending: true,
        error: null,
      }));

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const history = [...state.messages, userTurn];
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
          signal: controller.signal,
        });

        if (response.status === 503) {
          setState((prev) => ({ ...prev, sending: false, error: "config", messages: prev.messages.slice(0, -1) }));
          return;
        }
        if (response.status === 429) {
          setState((prev) => ({ ...prev, sending: false, error: "rate", messages: prev.messages.slice(0, -1) }));
          return;
        }
        if (!response.ok || !response.body) {
          setState((prev) => ({ ...prev, sending: false, error: "generic", messages: prev.messages.slice(0, -1) }));
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamError = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const evt of events) {
            const line = evt.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload) as { delta?: string; error?: string };
              if (parsed.error) {
                streamError = true;
                continue;
              }
              if (parsed.delta) {
                setState((prev) => {
                  const next = prev.messages.slice();
                  const last = next[next.length - 1];
                  if (last && last.role === "model") {
                    next[next.length - 1] = {
                      role: "model",
                      content: last.content + parsed.delta,
                    };
                  }
                  return { ...prev, messages: next };
                });
              }
            } catch {
              // malformed chunk — ignore
            }
          }
        }

        setState((prev) => ({
          ...prev,
          sending: false,
          error: streamError ? "generic" : null,
        }));
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === "AbortError";
        if (aborted) return;
        setState((prev) => ({
          ...prev,
          sending: false,
          error: "network",
          messages: prev.messages.slice(0, -1),
        }));
      } finally {
        abortRef.current = null;
      }
    },
    [state.messages],
  );

  return { messages: state.messages, sending: state.sending, error: state.error, send, clear };
}
