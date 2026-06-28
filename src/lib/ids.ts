/**
 * Public identifier helpers and DTO sanitizers.
 *
 * GLOBAL RULE (CLAUDE.md §5): internal `id` / `*Id` / `*_id` fields must NEVER
 * leave the system. Externally-referenced entities expose a `kid` (short id) or a
 * `tsuuid` (timestamped uuid for larger/complex resources). Always map entities to
 * DTOs through `toPublic*` helpers before returning them over any external channel.
 */
import { customAlphabet } from "nanoid";

// URL-safe, unambiguous alphabet (no look-alike chars).
const alphabet = "0123456789abcdefghijkmnpqrstuvwxyz";
const nano = customAlphabet(alphabet, 12);

/** Short public id for small/simple resources. */
export function kid(prefix?: string): string {
  const id = nano();
  return prefix ? `${prefix}_${id}` : id;
}

/** Timestamped UUID-like id for larger/complex resources or idempotency keys. */
export function tsuuid(): string {
  const ts = Date.now().toString(36);
  return `${ts}-${customAlphabet(alphabet, 20)()}`;
}

const INTERNAL_KEY = /(^id$)|(Id$)|(_id$)/;

/**
 * Recursively strip internal identifier fields from a plain object/array before
 * it crosses the system boundary. Use as a final safety net in addition to
 * explicit `select`/mappers.
 */
export function stripInternalIds<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripInternalIds(v)) as unknown as T;
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (INTERNAL_KEY.test(k) && k !== "kid") continue;
      out[k] = stripInternalIds(v);
    }
    return out as T;
  }
  return value;
}
