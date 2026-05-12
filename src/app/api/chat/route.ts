import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { dataSource } from "@/lib/data-source";
import { buildSystemPrompt } from "@/lib/chat/system-prompt";
import { sanitizeMessages, type ChatMessage } from "@/lib/chat/sanitize";
import { checkRateLimit } from "@/lib/chat/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gemini-2.5-flash";

let cachedSystemPrompt: string | null = null;
function getSystemPrompt(): string {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = buildSystemPrompt(
    dataSource.getAllEventSummaries(),
    dataSource.getTagAggregates(),
  );
  return cachedSystemPrompt;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "anon";
}

function sseEncode(event: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

function sseDone(): Uint8Array {
  return new TextEncoder().encode(`data: [DONE]\n\n`);
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "Chatbot not configured — GEMINI_API_KEY missing in environment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: unknown } | null)?.messages;
  const parsed = sanitizeMessages(messages);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const rate = await checkRateLimit(clientIp(request));
  if (!rate.ok) {
    return NextResponse.json(
      {
        error: `Rate limit reached (${rate.scope}ly). Try again in ${Math.max(1, Math.ceil(rate.resetSec / 60))} minutes.`,
        scope: rate.scope,
        resetSec: rate.resetSec,
      },
      { status: 429 },
    );
  }

  const history = parsed.messages.slice(0, -1);
  const lastUser = parsed.messages[parsed.messages.length - 1] as ChatMessage;

  const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = ai.getGenerativeModel({
    model: MODEL,
    systemInstruction: getSystemPrompt(),
  });
  const chat = model.startChat({
    history: history.map((m) => ({ role: m.role, parts: [{ text: m.content }] })),
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const result = await chat.sendMessageStream(lastUser.content);
        for await (const chunk of result.stream) {
          const delta = chunk.text();
          if (delta) controller.enqueue(sseEncode({ delta }));
        }
        controller.enqueue(sseDone());
      } catch (err) {
        const message = err instanceof Error ? err.message : "upstream error";
        controller.enqueue(sseEncode({ error: message }));
        controller.enqueue(sseDone());
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
