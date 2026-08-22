/**
 * Loads `.env` into `process.env` for the CLI scripts.
 *
 * Next.js does this on its own, so the web app never needed it — but the `tsx`
 * scripts (`sync`, `backfill`, `worker`, `reprioritize`, `check:cpf`) are plain
 * Node, and `tsx` does not read `.env`. In production they run inside Docker,
 * where compose injects the variables, so the gap only shows up locally: the
 * script starts, finds `DATABASE_URL` empty, and fails in whatever way that
 * subsystem fails. The CPF checker was the one that surfaced it, by reporting
 * `mock` for an account that was already configured.
 *
 * Two rules make this safe in both environments:
 *
 *  - **A missing file is fine.** Node's own `--env-file` throws when the file
 *    is absent, which would break every container. Here it is a no-op.
 *  - **Never overwrite.** A variable already in the environment wins, so
 *    compose, CI and `FOO=bar npm run …` all keep the last word over the file.
 *
 * Import for side effects, before anything that reads `env`:
 *
 *     import "./load-env";
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Strip one layer of matching quotes, the way a shell would. */
function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];
  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote) && trimmed.length > 1) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Parse and apply one env file. Deliberately small: `KEY=value`, `#` comments,
 * optional quotes, and `\n` escapes inside double quotes — which is what the
 * Apple private key needs (see `.env.example`).
 */
function load(file: string): void {
  let contents: string;
  try {
    contents = readFileSync(join(root, file), "utf8");
  } catch {
    return; // No file here — the environment is expected to supply everything.
  }

  for (const line of contents.split("\n")) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue; // Already set: leave it alone.

    const wasDoubleQuoted = rawValue.trim().startsWith('"');
    const value = unquote(rawValue);
    process.env[key] = wasDoubleQuoted ? value.replace(/\\n/g, "\n") : value;
  }
}

load(".env");
