import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let hourly: Ratelimit | null = null;
let daily: Ratelimit | null = null;
let initialized = false;

function init(): void {
  if (initialized) return;
  initialized = true;
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn("[chat] Upstash env missing — rate limiting disabled");
    return;
  }
  const redis = Redis.fromEnv();
  hourly = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 h"),
    prefix: "chat:h",
  });
  daily = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, "1 d"),
    prefix: "chat:d",
  });
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; resetSec: number; scope: "hour" | "day" };

export async function checkRateLimit(ip: string): Promise<RateLimitResult> {
  init();
  if (!hourly || !daily) return { ok: true };
  const [h, d] = await Promise.all([hourly.limit(ip), daily.limit(ip)]);
  if (!h.success) {
    return { ok: false, scope: "hour", resetSec: Math.ceil((h.reset - Date.now()) / 1000) };
  }
  if (!d.success) {
    return { ok: false, scope: "day", resetSec: Math.ceil((d.reset - Date.now()) / 1000) };
  }
  return { ok: true };
}
