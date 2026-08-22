/**
 * CPF handling (CLAUDE.md §5). A leak must expose nothing beyond first/last name,
 * so CPF is:
 *   - encrypted at rest (AES-256-GCM, reversible only with CPF_ENC_KEY),
 *   - hashed deterministically (HMAC-SHA256 with CPF_HMAC_KEY) for dedup and the
 *     "one vote per CPF per theme" uniqueness constraint — without storing or
 *     comparing plaintext,
 *   - reduced to a 6-digit clear prefix for low-sensitivity display/analytics.
 */
import { createHmac } from "node:crypto";
import { env } from "@/lib/env";
import { open, seal } from "@/lib/crypto/box";

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

/** Encrypt a CPF. See `@/lib/crypto/box` for the format. */
export function encryptCpf(cpf: string): string {
  return seal(normalizeCpf(cpf));
}

/**
 * Decrypt a CPF produced by `encryptCpf`.
 *
 * Two callers only: an authorized retrieval, and the vote challenge, which
 * needs three digits by position. Never log the result.
 */
export function decryptCpf(payload: string): string {
  return open(payload);
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
