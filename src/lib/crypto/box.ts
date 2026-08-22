/**
 * Authenticated encryption for the few personal fields Votto must be able to
 * read back — today the CPF and the birth date.
 *
 * AES-256-GCM under `CPF_ENC_KEY`. GCM rather than CBC because it authenticates:
 * a tampered ciphertext fails to open instead of decrypting to garbage that the
 * caller might then treat as a real CPF.
 *
 * The key name still says CPF because that is the key the deployment already
 * holds and rotating it is a data migration, not a config change. What it
 * protects is "the reversible personal fields", and this module is the one
 * place that knows how.
 *
 * Everything sealed here is opened only in memory, for one comparison, and is
 * never logged (CLAUDE.md §5).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";

function key(): Buffer {
  const bytes = Buffer.from(env.cpfEncKey, "base64");
  if (bytes.length !== 32) {
    throw new Error("CPF_ENC_KEY must be 32 bytes (base64-encoded).");
  }
  return bytes;
}

/** Encrypt. Output format: base64(iv).base64(authTag).base64(ciphertext). */
export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Decrypt a payload produced by {@link seal}. Throws if it was tampered with. */
export function open(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Open a payload that may be absent or unreadable, without throwing.
 *
 * Used on the vote path, where a citizen whose record predates a field must get
 * a clean "cannot challenge you" rather than a 500.
 */
export function tryOpen(payload: string | null | undefined): string | null {
  if (!payload) return null;
  try {
    return open(payload);
  } catch {
    return null;
  }
}
