/**
 * Câmara dos Deputados — Dados Abertos API v2 importer.
 *
 * Base: https://dadosabertos.camara.leg.br/api/v2 (REST/JSON, no auth).
 * Docs: https://dadosabertos.camara.leg.br/swagger/api.html
 *
 * Imports, in order:
 *   1. `partidos`   → Party
 *   2. `deputados`  → PublicAgent (FEDERAL_DEPUTY), linked to its Party
 *   3. recent `votacoes` (within `days`) and their `votos`
 *        → Theme (from the related proposição) + AGENT Votes
 *
 * The Câmara API does NOT publish dimension weights, so imported Themes are left
 * without `dimensions` (the positioning index simply ignores them until an editor
 * tags them). Coverage is best-effort and defensive about response shapes.
 */
import {
  fetchJson,
  sleep,
  syncPartyAgentCounts,
  upsertAgent,
  upsertAgentVote,
  upsertArticle,
  upsertParty,
  upsertTheme,
  type Importer,
  type ImportOptions,
  type ImportResult,
} from "@/lib/integration/importer";
import { AgentType, ImportSource, Scope, VoteValue } from "@/generated/prisma";

const BASE = "https://dadosabertos.camara.leg.br/api/v2";
const SOURCE = ImportSource.CAMARA;

/** Polite delay between paged/related requests (ms). */
const REQUEST_DELAY = 250;

// ─── Minimal response shapes (only the fields we read) ───────────────────────

interface CamaraLink {
  rel?: string;
  href?: string;
}

interface CamaraPage<T> {
  dados?: T[];
  links?: CamaraLink[];
}

interface CamaraPartido {
  id?: number;
  sigla?: string;
  nome?: string;
  uri?: string;
  urlLogo?: string;
}

interface CamaraDeputado {
  id?: number;
  nome?: string;
  siglaPartido?: string;
  siglaUf?: string;
  urlFoto?: string;
  email?: string;
}

interface CamaraVotacao {
  id?: string;
  data?: string;
  dataHoraRegistro?: string;
  descricao?: string;
  proposicaoObjeto?: string;
  uriProposicaoObjeto?: string;
  siglaOrgao?: string;
}

interface CamaraProposicao {
  id?: number;
  siglaTipo?: string;
  numero?: number;
  ano?: number;
  ementa?: string;
  urlInteiroTeor?: string;
}

interface CamaraVoto {
  tipoVoto?: string;
  deputado_?: { id?: number; nome?: string; siglaPartido?: string; siglaUf?: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Split a full name into first + remaining as last name. */
function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = (full ?? "").trim();
  if (!trimmed) return { firstName: "Deputado", lastName: "" };
  const parts = trimmed.split(/\s+/);
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/** Map a Câmara `tipoVoto` string to our VoteValue (null = ignore the record). */
function mapVote(tipo: string | undefined): VoteValue | null {
  const t = (tipo ?? "").trim().toLowerCase();
  if (t === "sim") return VoteValue.YES;
  if (t === "não" || t === "nao") return VoteValue.NO;
  if (t === "abstenção" || t === "abstencao") return VoteValue.ABSTENTION;
  if (t === "obstrução" || t === "obstrucao") return VoteValue.ABSTENTION;
  if (t.startsWith("artigo 17")) return VoteValue.ABSTENTION;
  return null;
}

/** Follow `links[rel=next]` pagination, yielding each page's `dados` array. */
async function* paginate<T>(firstUrl: string): AsyncGenerator<T[]> {
  let url: string | null = firstUrl;
  while (url) {
    const page: CamaraPage<T> = await fetchJson<CamaraPage<T>>(url);
    yield Array.isArray(page.dados) ? page.dados : [];
    const next = page.links?.find((l) => l.rel === "next")?.href ?? null;
    url = next && next !== url ? next : null;
    if (url) await sleep(REQUEST_DELAY);
  }
}

/** ISO date `days` ago, formatted as YYYY-MM-DD for the API's date filters. */
function dateNDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─── Sub-imports ─────────────────────────────────────────────────────────────

/**
 * Import all active parties. Returns a map of `sigla → internal party id` used to
 * link deputies.
 */
async function importParties(
  counters: { seen: number; upserted: number },
): Promise<Map<string, string>> {
  const bySigla = new Map<string, string>();
  const url = `${BASE}/partidos?ordem=ASC&ordenarPor=sigla&itens=100`;

  for await (const dados of paginate<CamaraPartido>(url)) {
    for (const p of dados) {
      counters.seen++;
      if (p.id == null) continue;
      const partyId = await upsertParty({
        source: SOURCE,
        externalRef: String(p.id),
        name: p.nome ?? p.sigla ?? `Partido ${p.id}`,
        acronym: p.sigla ?? null,
        logoUrl: p.urlLogo ?? null,
      });
      counters.upserted++;
      if (p.sigla) bySigla.set(p.sigla.toUpperCase(), partyId);
    }
  }
  return bySigla;
}

/** Import current deputies, linking them to parties by sigla. */
async function importDeputies(
  partyBySigla: Map<string, string>,
  counters: { seen: number; upserted: number },
  limit?: number,
): Promise<void> {
  const url = `${BASE}/deputados?ordem=ASC&ordenarPor=nome&itens=100`;

  for await (const dados of paginate<CamaraDeputado>(url)) {
    for (const d of dados) {
      if (limit && counters.seen >= limit) return;
      counters.seen++;
      if (d.id == null) continue;
      const { firstName, lastName } = splitName(d.nome ?? "");
      const partyId = d.siglaPartido
        ? partyBySigla.get(d.siglaPartido.toUpperCase()) ?? null
        : null;
      await upsertAgent({
        source: SOURCE,
        externalRef: String(d.id),
        firstName,
        lastName,
        type: AgentType.FEDERAL_DEPUTY,
        email: d.email ?? null,
        imageUrl: d.urlFoto ?? null,
        state: d.siglaUf ?? null,
        partyId,
      });
      counters.upserted++;
    }
  }
}

/** Resolve a proposição (theme source) by id, defensively. */
async function fetchProposicao(id: number): Promise<CamaraProposicao | null> {
  try {
    const res = await fetchJson<{ dados?: CamaraProposicao }>(
      `${BASE}/proposicoes/${id}`,
    );
    return res.dados ?? null;
  } catch {
    return null;
  }
}

/**
 * Import recent votações and their per-deputy votes. Each votação is linked to a
 * Theme derived from the related proposição (object of the vote). Votes are keyed
 * by `votacao:{votacaoId}:deputado:{deputadoId}` for idempotency.
 */
async function importVotacoes(
  counters: { seen: number; upserted: number },
  days: number,
  limit?: number,
): Promise<void> {
  const from = dateNDaysAgo(days);
  const to = dateNDaysAgo(0);
  const url = `${BASE}/votacoes?dataInicio=${from}&dataFim=${to}&ordem=DESC&ordenarPor=dataHoraRegistro&itens=50`;

  // Cache proposição → internal theme id so we don't re-resolve per votação.
  const themeByProposicao = new Map<number, string>();
  let processed = 0;

  for await (const dados of paginate<CamaraVotacao>(url)) {
    for (const v of dados) {
      if (limit && processed >= limit) return;
      if (!v.id) continue;
      counters.seen++;
      processed++;

      // Derive the proposição id from `uriProposicaoObjeto` when present.
      const propId = extractIdFromUri(v.uriProposicaoObjeto);
      let themeId: string | undefined;

      if (propId != null) {
        themeId = themeByProposicao.get(propId);
        if (!themeId) {
          const prop = await fetchProposicao(propId);
          await sleep(REQUEST_DELAY);
          const name = prop
            ? prop.siglaTipo && prop.numero && prop.ano
              ? `${prop.siglaTipo} ${prop.numero}/${prop.ano}`
              : prop.ementa?.slice(0, 120) ?? `Proposição ${propId}`
            : `Proposição ${propId}`;
          themeId = await upsertTheme({
            source: SOURCE,
            externalRef: String(propId),
            name,
            summary: prop?.ementa ?? v.descricao ?? "",
            scope: Scope.NATIONAL,
          });
          themeByProposicao.set(propId, themeId);
          // Attach inteiro teor as an Article when available.
          if (prop?.urlInteiroTeor) {
            await upsertArticle({
              source: SOURCE,
              externalRef: `proposicao:${propId}:inteiroteor`,
              themeId,
              originalUrl: prop.urlInteiroTeor,
              title: name,
              downloadUrl: prop.urlInteiroTeor,
            });
          }
        }
      } else {
        // No related proposição: fall back to a votação-scoped Theme.
        themeId = await upsertTheme({
          source: SOURCE,
          externalRef: `votacao:${v.id}`,
          name: (v.proposicaoObjeto ?? v.descricao ?? `Votação ${v.id}`).slice(0, 120),
          summary: v.descricao ?? "",
          scope: Scope.NATIONAL,
        });
      }

      await importVotos(v.id, themeId, counters);
    }
  }
}

/** Import the individual votes (`votos`) of a single votação into a Theme. */
async function importVotos(
  votacaoId: string,
  themeId: string,
  counters: { seen: number; upserted: number },
): Promise<void> {
  let votos: CamaraVoto[];
  try {
    const res = await fetchJson<{ dados?: CamaraVoto[] }>(
      `${BASE}/votacoes/${encodeURIComponent(votacaoId)}/votos`,
    );
    votos = Array.isArray(res.dados) ? res.dados : [];
  } catch {
    return; // Skip votações whose votes can't be read.
  }
  await sleep(REQUEST_DELAY);

  for (const voto of votos) {
    const dep = voto.deputado_;
    if (!dep?.id) continue;
    const value = mapVote(voto.tipoVoto);
    if (value === null) continue;

    // The deputy must already exist (imported above) — link by externalRef.
    const agentId = await ensureDeputyId(dep);
    if (!agentId) continue;

    await upsertAgentVote({
      source: SOURCE,
      externalRef: `votacao:${votacaoId}:deputado:${dep.id}`,
      themeId,
      agentId,
      value,
    });
    counters.upserted++;
  }
}

/**
 * Resolve a deputy's internal id, upserting a minimal record if the votes list
 * surfaces a deputy that wasn't in the active roster (e.g. a former deputy).
 */
async function ensureDeputyId(dep: {
  id?: number;
  nome?: string;
  siglaPartido?: string;
  siglaUf?: string;
}): Promise<string | null> {
  if (dep.id == null) return null;
  const { firstName, lastName } = splitName(dep.nome ?? "");
  return upsertAgent({
    source: SOURCE,
    externalRef: String(dep.id),
    firstName,
    lastName,
    type: AgentType.FEDERAL_DEPUTY,
    state: dep.siglaUf ?? null,
  });
}

/** Extract a trailing numeric id from a Câmara resource URI. */
function extractIdFromUri(uri: string | undefined): number | null {
  if (!uri) return null;
  const m = uri.match(/\/(\d+)\/?$/);
  return m ? Number(m[1]) : null;
}

// ─── Importer ────────────────────────────────────────────────────────────────

/**
 * The Câmara dos Deputados importer. Run via `runImport(camaraImporter, opts)`.
 */
export const camaraImporter: Importer = {
  source: SOURCE,
  async run(opts: ImportOptions): Promise<ImportResult> {
    const days = opts.days ?? 30;
    const limit = opts.limit;
    const counters = { seen: 0, upserted: 0 };

    const partyBySigla = await importParties(counters);
    await importDeputies(partyBySigla, counters, limit);
    await importVotacoes(counters, days, limit);
    await syncPartyAgentCounts(SOURCE);

    return { itemsSeen: counters.seen, itemsUpserted: counters.upserted };
  },
};
