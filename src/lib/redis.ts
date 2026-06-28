/**
 * Optional Redis cache (used by the alignment index). The app must remain fully
 * functional without Redis — every helper here no-ops gracefully when REDIS_URL
 * is unset or the server is unreachable.
 */
import Redis from "ioredis";
import { env, isRedisEnabled } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

function getClient(): Redis | null {
  if (!isRedisEnabled()) return null;
  if (globalForRedis.redis !== undefined) return globalForRedis.redis;

  try {
    const client = new Redis(env.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    client.on("error", () => {
      // Swallow connection errors — cache is best-effort.
    });
    globalForRedis.redis = client;
    return client;
  } catch {
    globalForRedis.redis = null;
    return null;
  }
}

/** Read a cached JSON value, or null on miss/unavailable. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Write a JSON value with a TTL (seconds). Silent no-op if cache unavailable. */
export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch {
    // best-effort
  }
}
