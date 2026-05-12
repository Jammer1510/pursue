"use client";

import { Fragment } from "react";
import Link from "next/link";
import type { ChatTurn } from "./use-chat";

const CITATION_PATTERN = /\[event:(\d+)\]/g;

function renderContent(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let i = 0;
  for (const match of text.matchAll(CITATION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor, start)}</Fragment>);
    }
    const id = match[1];
    nodes.push(
      <Link
        key={`l${i}`}
        href={`/?event=${id}`}
        className="font-mono text-xs text-zinc-300 underline decoration-zinc-600 underline-offset-2 hover:text-zinc-100 hover:decoration-zinc-300"
      >
        #{id}
      </Link>,
    );
    cursor = start + match[0].length;
    i++;
  }
  if (cursor < text.length) {
    nodes.push(<Fragment key={`t${i}`}>{text.slice(cursor)}</Fragment>);
  }
  return nodes;
}

export function ChatMessage({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div
      className={
        isUser
          ? "self-end max-w-[85%] rounded-md border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-sm text-zinc-100 whitespace-pre-wrap"
          : "self-start max-w-[95%] rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-300 whitespace-pre-wrap"
      }
      role={isUser ? undefined : "status"}
      aria-live={isUser ? undefined : "polite"}
    >
      {turn.content ? (
        renderContent(turn.content)
      ) : (
        <span className="font-mono text-xs text-zinc-500">…</span>
      )}
    </div>
  );
}
