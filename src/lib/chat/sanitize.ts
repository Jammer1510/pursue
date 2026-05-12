export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

const MAX_HISTORY = 10;
const MAX_MESSAGE_CHARS = 2000;
const JAILBREAK_PATTERN =
  /ignore\s+(previous|all|prior|the\s+above)\s+(instructions|prompts|rules|system\s+prompt)/i;

export type SanitizeResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; status: number; error: string };

export function sanitizeMessages(raw: unknown): SanitizeResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, status: 400, error: "messages must be a non-empty array" };
  }
  const trimmed = raw.slice(-MAX_HISTORY);
  const messages: ChatMessage[] = [];
  for (const item of trimmed) {
    if (!item || typeof item !== "object") {
      return { ok: false, status: 400, error: "message must be an object" };
    }
    const m = item as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "model") {
      return { ok: false, status: 400, error: `invalid role: ${String(m.role)}` };
    }
    if (typeof m.content !== "string") {
      return { ok: false, status: 400, error: "message content must be a string" };
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      return { ok: false, status: 400, error: `message exceeds ${MAX_MESSAGE_CHARS} chars` };
    }
    if (JAILBREAK_PATTERN.test(m.content)) {
      return { ok: false, status: 400, error: "message rejected by content filter" };
    }
    messages.push({ role: m.role, content: m.content });
  }
  if (messages[messages.length - 1]?.role !== "user") {
    return { ok: false, status: 400, error: "last message must be from user" };
  }
  return { ok: true, messages };
}
