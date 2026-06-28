/**
 * CPF handling (CLAUDE.md §5). A leak must expose nothing beyond first/last name,
 * so CPF is:
 *   - encrypted at rest (AES-256-GCM, reversible only with CPF_ENC_KEY),
 *   - hashed deterministically (HMAC-SHA256 with CPF_HMAC_KEY) for dedup and the
 *     "one vote per CPF per theme" uniqueness constraint — without storing or
 *     comparing plaintext,
 *   - reduced to a 6-digit clear prefix for low-sensitivity display/analytics.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";

function encKey(): Buffer {
  const key = Buffer.from(env.cpfEncKey, "base64");
  if (key.length !== 32) {
    throw new Error("CPF_ENC_KEY must be 32 bytes (base64-encoded).");
  }
  return key;
}

/** Remove all non-digits from a CPF string. */
export function normalizeCpf(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/** Validate a Brazilian CPF (length + check digits). */
export function isValidCpf(cpf: string): boolean {
  const c = normalizeCpf(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(c[i], 10) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(c[9], 10) && calc(10) === parseInt(c[10], 10);
}

/** Encrypt a CPF. Output format: base64(iv).base64(authTag).base64(ciphertext). */
export function encryptCpf(cpf: string): string {
  const data = normalizeCpf(cpf);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, encKey(), iv);
  const enc = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Decrypt a CPF produced by `encryptCpf`. Authorized, rare use only. */
export function decryptCpf(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  const decipher = createDecipheriv(ALGO, encKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Deterministic keyed hash for dedup / uniqueness (never reversible). */
export function hashCpf(cpf: string): string {
  return createHmac("sha256", env.cpfHmacKey)
    .update(normalizeCpf(cpf))
    .digest("hex");
}

/** First six digits of the CPF, in clear (does not identify a person). */
export function cpfPrefix(cpf: string): string {
  return normalizeCpf(cpf).slice(0, 6);
}

/** Convenience bundle of all stored CPF representations. */
export function deriveCpfFields(cpf: string) {
  return {
    cpfEncrypted: encryptCpf(cpf),
    cpfHash: hashCpf(cpf),
    cpfPrefix: cpfPrefix(cpf),
  };
}
