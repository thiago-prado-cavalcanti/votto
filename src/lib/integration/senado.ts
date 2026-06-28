/**
 * Senado Federal — Dados Abertos importer.
 *
 * Base: https://legis.senado.leg.br/dadosabertos (append `.json` or send
 * `Accept: application/json`; the service otherwise replies with XML).
 *
 * Imports, best-effort:
 *   1. senadores (ListaSenadorService)          → PublicAgent (SENATOR)
 *   2. matérias atualizadas (last N days)        → Theme
 *   3. votações of those matérias                → AGENT Votes
 *
 * The Senado endpoints are notoriously shape-variant (deeply nested, sometimes
 * single-object-instead-of-array, occasionally XML even when JSON is requested).
 * Every record is parsed defensively and unparseable ones are skipped rather than
 * crashing the run. Partial coverage is acceptable by design.
 */
import {
  fetchJson,
  sleep,
  syncPartyAgentCounts,
  upsertAgent,
  upsertAgentVote,
  upsertTheme,
  upsertParty,
  type Importer,
  type ImportOptions,
  type ImportResult,
} from "@/lib/integration/importer";
import { AgentType, ImportSource, Scope, VoteValue } from "@/generated/prisma";

const BASE = "https://legis.senado.leg.br/dadosabertos";
const SOURCE = ImportSource.SENADO;
const REQUEST_DELAY = 300;

/** JSON request headers for the Senado service. */
const JSON_HEADERS = { Accept: "application/json" } as const;

// ─── Defensive access helpers ────────────────────────────────────────────────

/** Treat any value as an object record (or empty object). */
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Coerce a possibly-single value into an array (Senado often omits arrays of 1). */
function arr<T = unknown>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v === undefined || v === null || v === "") return [];
  return [v as T];
}

/** Read a string-ish leaf value. */
function str(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return undefined;
}

/** Walk a dotted path through nested objects, tolerating missing levels. */
function dig(root: unknown, path: string): unknown {
  let cur: unknown = root;
  for (const key of path.split(".")) {
    cur = obj(cur)[key];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Split a name into first + last. */
function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { firstName: "Senador", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Map a Senado vote description to a VoteValue (null = ignore). */
function mapVote(desc: string | undefined): VoteValue | null {
  const t = (desc ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.startsWith("sim")) return VoteValue.YES;
  if (t.startsWith("não") || t.startsWith("nao")) return VoteValue.NO;
  if (t.includes("absten")) return VoteValue.ABSTENTION;
  if (t.includes("obstru")) return VoteValue.ABSTENTION;
  return null;
}

/** Fetch JSON from the Senado service, returning null on any failure. */
async function tryFetch<T = unknown>(path: string): Promise<T | null> {
  try {
    return await fetchJson<T>(`${BASE}${path}`, { headers: JSON_HEADERS });
  } catch {
    return null;
  }
}

// ─── Sub-imports ─────────────────────────────────────────────────────────────

/**
 * Import the current senators. Returns a map of `senator code → internal agent id`
 * used to attach votes. Also upserts the senator's party.
 */
async function importSenators(
  counters: { seen: number; upserted: number },
  limit?: number,
): Promise<Map<string, string>> {
  const byCode = new Map<string, string>();
  const data = await tryFetch("/senador/lista/atual.json");
  await sleep(REQUEST_DELAY);
  if (!data) return byCode;

  // Path: ListaParlamentarEmExercicio.Parlamentares.Parlamentar[]
  const list = arr(
    dig(data, "ListaParlamentarEmExercicio.Parlamentares.Parlamentar"),
  );
  const partyCache = new Map<string, string>();

  for (const item of list) {
    if (limit && counters.seen >= limit) break;
    counters.seen++;
    const ident = obj(dig(item, "IdentificacaoParlamentar"));
    const code = str(ident.CodigoParlamentar);
    if (!code) continue;

    const fullName = str(ident.NomeParlamentar) ?? str(ident.NomeCompletoParlamentar) ?? "";
    const { firstName, lastName } = splitName(fullName);
    const uf = str(ident.UfParlamentar);
    const photo = str(ident.UrlFotoParlamentar);
    const email = str(ident.EmailParlamentar);
    const partyAcronym = str(ident.SiglaPartidoParlamentar);

    let partyId: string | null = null;
    if (partyAcronym) {
      partyId = partyCache.get(partyAcronym.toUpperCase()) ?? null;
      if (!partyId) {
        partyId = await upsertParty({
          source: SOURCE,
          externalRef: `partido:${partyAcronym.toUpperCase()}`,
          name: partyAcronym,
          acronym: partyAcronym,
        });
        partyCache.set(partyAcronym.toUpperCase(), partyId);
      }
    }

    const agentId = await upsertAgent({
      source: SOURCE,
      externalRef: code,
      firstName,
      lastName,
      type: AgentType.SENATOR,
      email: email ?? null,
      imageUrl: photo ?? null,
      state: uf ?? null,
      partyId,
    });
    counters.upserted++;
    byCode.set(code, agentId);
  }
  return byCode;
}

/**
 * Import recently changed matérias as Themes. Returns the list of matéria codes
 * so their votações can be imported next.
 */
async function importMaterias(
  counters: { seen: number; upserted: number },
  days: number,
  limit?: number,
): Promise<Array<{ code: string; themeId: string }>> {
  const out: Array<{ code: string; themeId: string }> = [];
  const data = await tryFetch(`/materia/atualizadas.json?numdias=${days}`);
  await sleep(REQUEST_DELAY);
  if (!data) return out;

  // Path varies; try the documented shape then a fallback.
  const list = arr(
    dig(data, "MateriasAtualizadas.Materias.Materia") ??
      dig(data, "ListaMateriasAtualizadas.Materias.Materia"),
  );

  for (const item of list) {
    if (limit && out.length >= limit) break;
    counters.seen++;
    const ident = obj(dig(item, "IdentificacaoMateria"));
    const code = str(ident.CodigoMateria);
    if (!code) continue;

    const sigla = str(ident.SiglaSubtipoMateria);
    const numero = str(ident.NumeroMateria);
    const ano = str(ident.AnoMateria);
    const ementa =
      str(dig(item, "DadosBasicosMateria.EmentaMateria")) ??
      str(ident.DescricaoIdentificacaoMateria) ??
      "";
    const name =
      sigla && numero && ano
        ? `${sigla} ${numero}/${ano}`
        : ementa.slice(0, 120) || `Matéria ${code}`;

    const themeId = await upsertTheme({
      source: SOURCE,
      externalRef: code,
      name,
      summary: ementa,
      scope: Scope.NATIONAL,
    });
    counters.upserted++;
    out.push({ code, themeId });
  }
  return out;
}

/**
 * Import the votações (and their per-senator votes) of a single matéria.
 * Vote externalRef: `votacao:{votacaoCode}:senador:{senatorCode}`.
 */
async function importMateriaVotacoes(
  materiaCode: string,
  themeId: string,
  senatorByCode: Map<string, string>,
  counters: { seen: number; upserted: number },
): Promise<void> {
  const data = await tryFetch(`/materia/votacoes/${materiaCode}.json`);
  await sleep(REQUEST_DELAY);
  if (!data) return;

  const votacoes = arr(
    dig(data, "VotacaoMateria.Materia.Votacoes.Votacao") ??
      dig(data, "VotacaoMateria.Votacoes.Votacao"),
  );

  for (const votacao of votacoes) {
    const votacaoCode =
      str(dig(votacao, "CodigoSessaoVotacao")) ??
      str(dig(votacao, "SequencialSessao")) ??
      materiaCode;
    const votos = arr(dig(votacao, "Votos.VotoParlamentar"));

    for (const voto of votos) {
      const parl = obj(dig(voto, "IdentificacaoParlamentar"));
      const code = str(parl.CodigoParlamentar);
      const value = mapVote(str(dig(voto, "DescricaoVoto")) ?? str(dig(voto, "SiglaVoto")));
      if (!code || value === null) continue;

      // Attach a minimal senator record if the vote references an unknown code.
      let agentId = senatorByCode.get(code);
      if (!agentId) {
        const fullName = str(parl.NomeParlamentar) ?? "";
        const { firstName, lastName } = splitName(fullName);
        agentId = await upsertAgent({
          source: SOURCE,
          externalRef: code,
          firstName,
          lastName,
          type: AgentType.SENATOR,
          state: str(parl.SiglaUfParlamentar) ?? null,
        });
        senatorByCode.set(code, agentId);
      }

      await upsertAgentVote({
        source: SOURCE,
        externalRef: `votacao:${votacaoCode}:senador:${code}`,
        themeId,
        agentId,
        value,
      });
      counters.upserted++;
    }
  }
}

// ─── Importer ────────────────────────────────────────────────────────────────

/**
 * The Senado Federal importer. Run via `runImport(senadoImporter, opts)`.
 */
export const senadoImporter: Importer = {
  source: SOURCE,
  async run(opts: ImportOptions): Promise<ImportResult> {
    const days = opts.days ?? 30;
    const limit = opts.limit;
    const counters = { seen: 0, upserted: 0 };

    const senatorByCode = await importSenators(counters, limit);
    const materias = await importMaterias(counters, days, limit);

    for (const m of materias) {
      try {
        await importMateriaVotacoes(m.code, m.themeId, senatorByCode, counters);
      } catch {
        // Skip a matéria whose votações can't be parsed; keep the run alive.
      }
    }

    await syncPartyAgentCounts(SOURCE);
    return { itemsSeen: counters.seen, itemsUpserted: counters.upserted };
  },
};
