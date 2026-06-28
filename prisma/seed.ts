/**
 * Votto database seed — deterministic synthetic dataset.
 *
 * Goal: make the app feel alive WITHOUT any network access, while remaining fully
 * idempotent. Every record is upserted on a natural key, marked `source: MANUAL`
 * with a stable `externalRef` (e.g. `seed:party:pt`), so re-running this seed
 * never duplicates rows.
 *
 * Contents:
 *   - REAL parties (from Câmara Dados Abertos, with offline fallback)
 *   - REAL sitting federal deputies as PublicAgents (name, party, state, photo)
 *   - ~12 Themes (each with economic/social dimensions) and 1–3 Articles each
 *   - deterministic AGENT votes on most themes, with Theme tallies kept in sync
 *   - 2 sample citizen Users (valid test CPFs) with a handful of votes
 *   - 1 Administrator (SUPER_ADMIN)
 *
 * Determinism: all "random" choices derive from integer indices via a tiny
 * hashing helper, so the dataset (and thus alignment/positioning results) is
 * stable across runs.
 *
 * Run: `tsx prisma/seed.ts`. Requires DATABASE_URL, CPF_ENC_KEY, CPF_HMAC_KEY.
 */
import { db } from "@/lib/db";
import { kid } from "@/lib/ids";
import { deriveCpfFields } from "@/lib/crypto/cpf";
import { hashPassword } from "@/lib/auth/password";
import {
  AdminRole,
  AgentType,
  ImportSource,
  Scope,
  VoteValue,
  VoterType,
  type Prisma,
} from "@/generated/prisma";

const SRC = ImportSource.MANUAL;

// ─── Deterministic pseudo-randomness ─────────────────────────────────────────

/** Stable 32-bit hash of a string (FNV-1a) → used as a deterministic seed. */
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministically pick a VoteValue from a (agentIndex, themeIndex) pair.
 * Distribution skews toward decisive votes (YES/NO) with occasional ABSTENTION,
 * and a small fraction of "did not vote" (returns null) so coverage varies.
 */
function pickVote(agentIdx: number, themeIdx: number): VoteValue | null {
  const r = hashStr(`a${agentIdx}:t${themeIdx}`) % 100;
  if (r < 8) return null; // ~8% abstain from voting at all
  if (r < 18) return VoteValue.ABSTENTION; // ~10%
  if (r < 59) return VoteValue.YES; // ~41%
  return VoteValue.NO; // ~41%
}

// ─── Real roster: deputies (Câmara), senators (Senado), the President ────────
// Public agents are REAL: sitting federal deputies and senators (name, party,
// state, official photo) pulled from open-data APIs at seed time, plus the
// current President. Parties are real, with logos. A verified offline snapshot
// keeps the seed working without network.

const CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2";
const SENADO_API = "https://legis.senado.leg.br/dadosabertos";
const DEPUTY_COUNT = 40;
const SENATOR_COUNT = 16;

interface SeedParty {
  ref: string;
  name: string;
  acronym: string;
  description: string;
  logoUrl?: string;
}

interface SeedAgent {
  ref: string;
  firstName: string;
  lastName: string;
  type: AgentType;
  state?: string;
  municipality?: string;
  partyRef: string;
  imageUrl?: string;
  email?: string;
}

interface RawDeputy {
  id: number;
  nome: string;
  siglaPartido: string;
  siglaUf: string;
  urlFoto?: string;
  email?: string | null;
}

interface RawSenator {
  codigo: string;
  nome: string;
  sigla: string;
  uf: string;
}

interface CamaraList<T> {
  dados?: T[];
}

/** Full party names (fallback when the Câmara party list isn't available). */
const PARTY_NAMES: Record<string, string> = {
  MDB: "Movimento Democrático Brasileiro",
  PL: "Partido Liberal",
  PSDB: "Partido da Social Democracia Brasileira",
  NOVO: "Partido Novo",
  PP: "Progressistas",
  PT: "Partido dos Trabalhadores",
  PDT: "Partido Democrático Trabalhista",
  PSB: "Partido Socialista Brasileiro",
  REPUBLICANOS: "Republicanos",
  UNIÃO: "União Brasil",
  PCdoB: "Partido Comunista do Brasil",
  PV: "Partido Verde",
  REDE: "Rede Sustentabilidade",
  CIDADANIA: "Cidadania",
  PSOL: "Partido Socialismo e Liberdade",
  PODE: "Podemos",
  SOLIDARIEDADE: "Solidariedade",
  AVANTE: "Avante",
};

/** Official party logo (Câmara). Coverage is partial — the UI falls back to a
 *  typographic chip when the image fails to load. */
function partyLogoUrl(sigla: string): string {
  return `https://www.camara.leg.br/internet/Deputado/img/partidos/${encodeURIComponent(sigla)}.gif`;
}

/** Canonical official senator photo (Senado). */
function senatorPhotoUrl(codigo: string): string {
  return `https://legis.senado.leg.br/senadores/fotos-oficiais/${codigo}`;
}

/** Verified snapshot of real federal deputies (used only when the API is offline). */
const FALLBACK_DEPUTIES: RawDeputy[] = [
  { id: 204379, nome: "Acácio Favacho", siglaPartido: "MDB", siglaUf: "AP", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/204379.jpg" },
  { id: 220714, nome: "Adail Filho", siglaPartido: "MDB", siglaUf: "AM", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/220714.jpg" },
  { id: 221328, nome: "Adilson Barroso", siglaPartido: "PL", siglaUf: "SP", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/221328.jpg" },
  { id: 204560, nome: "Adolfo Viana", siglaPartido: "PSDB", siglaUf: "BA", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/204560.jpg" },
  { id: 204528, nome: "Adriana Ventura", siglaPartido: "NOVO", siglaUf: "SP", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/204528.jpg" },
  { id: 121948, nome: "Adriano do Baldy", siglaPartido: "PP", siglaUf: "GO", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/121948.jpg" },
  { id: 74646, nome: "Aécio Neves", siglaPartido: "PSDB", siglaUf: "MG", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/74646.jpg" },
  { id: 160508, nome: "Afonso Florence", siglaPartido: "PT", siglaUf: "BA", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/160508.jpg" },
  { id: 136811, nome: "Afonso Hamm", siglaPartido: "PP", siglaUf: "RS", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/136811.jpg" },
  { id: 178835, nome: "Afonso Motta", siglaPartido: "PDT", siglaUf: "RS", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/178835.jpg" },
  { id: 160527, nome: "Aguinaldo Ribeiro", siglaPartido: "PP", siglaUf: "PB", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/160527.jpg" },
  { id: 204495, nome: "Airton Faleiro", siglaPartido: "PT", siglaUf: "PA", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/204495.jpg" },
  { id: 204549, nome: "AJ Albuquerque", siglaPartido: "PP", siglaUf: "CE", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/204549.jpg" },
  { id: 73579, nome: "Alberto Fraga", siglaPartido: "PL", siglaUf: "DF", urlFoto: "https://www.camara.leg.br/internet/deputado/bandep/73579.jpg" },
];

/** Verified snapshot of real senators (used only when the Senado API is offline). */
const FALLBACK_SENATORS: RawSenator[] = [
  { codigo: "5672", nome: "Alan Rick", sigla: "REPUBLICANOS", uf: "AC" },
  { codigo: "5982", nome: "Alessandro Vieira", sigla: "MDB", uf: "SE" },
  { codigo: "6358", nome: "Ana Paula Lobato", sigla: "PSB", uf: "MA" },
];

/** The current President of the Republic. */
const PRESIDENT = {
  ref: "seed:agent:pres:lula",
  firstName: "Luiz Inácio",
  lastName: "Lula da Silva",
  partySigla: "PT",
  imageUrl: "https://commons.wikimedia.org/wiki/Special:FilePath/Lula_-_foto_oficial05.jpg",
};

/** Build a stable party ref from a party acronym. */
function partyRef(sigla: string): string {
  return `seed:party:${sigla.toLowerCase()}`;
}

/** Split a display name into first/last name parts. */
function splitName(nome: string): { firstName: string; lastName: string } {
  const parts = nome.trim().split(/\s+/);
  const firstName = parts[0] ?? nome;
  const lastName = parts.slice(1).join(" ") || firstName;
  return { firstName, lastName };
}

function deputyToAgent(d: RawDeputy): SeedAgent {
  const { firstName, lastName } = splitName(d.nome);
  return {
    ref: `seed:agent:dep:${d.id}`,
    firstName,
    lastName,
    type: AgentType.FEDERAL_DEPUTY,
    state: d.siglaUf,
    partyRef: partyRef(d.siglaPartido),
    imageUrl: d.urlFoto,
    email: d.email ?? undefined,
  };
}

function senatorToAgent(s: RawSenator): SeedAgent {
  const { firstName, lastName } = splitName(s.nome);
  return {
    ref: `seed:agent:sen:${s.codigo}`,
    firstName,
    lastName,
    type: AgentType.SENATOR,
    state: s.uf,
    partyRef: partyRef(s.sigla),
    imageUrl: senatorPhotoUrl(s.codigo),
  };
}

/** Assemble parties (with names + logos) from the agents' party acronyms. */
function buildParties(siglas: string[], partyName: (s: string) => string): SeedParty[] {
  return [...new Set(siglas.filter(Boolean))].map((sigla) => ({
    ref: partyRef(sigla),
    name: partyName(sigla),
    acronym: sigla,
    description: `${partyName(sigla)} (${sigla}).`,
    logoUrl: partyLogoUrl(sigla),
  }));
}

/** Fetch JSON with a 20s timeout. */
async function fetchJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch real senators from the Senado Dados Abertos API (best-effort). */
async function fetchSenators(): Promise<RawSenator[]> {
  try {
    type SenadoResp = {
      ListaParlamentarEmExercicio?: {
        Parlamentares?: {
          Parlamentar?: Array<{
            IdentificacaoParlamentar?: {
              CodigoParlamentar?: string;
              NomeParlamentar?: string;
              SiglaPartidoParlamentar?: string;
              UfParlamentar?: string;
            };
          }>;
        };
      };
    };
    const json = await fetchJson<SenadoResp>(`${SENADO_API}/senador/lista/atual.json`);
    const list = json.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ?? [];
    const senators = list
      .map((p) => p.IdentificacaoParlamentar)
      .filter((id): id is NonNullable<typeof id> => Boolean(id?.CodigoParlamentar))
      .map((id) => ({
        codigo: String(id.CodigoParlamentar),
        nome: id.NomeParlamentar ?? "",
        sigla: id.SiglaPartidoParlamentar ?? "",
        uf: id.UfParlamentar ?? "",
      }))
      .filter((s) => s.nome && s.sigla);
    return senators.slice(0, SENATOR_COUNT);
  } catch {
    return FALLBACK_SENATORS;
  }
}

/**
 * Build the full public-agent roster: real federal deputies (Câmara) + real
 * senators (Senado) + the President, with real parties and logos. Falls back to
 * verified offline snapshots when the APIs are unavailable.
 */
async function buildRoster(): Promise<{ parties: SeedParty[]; agents: SeedAgent[]; live: boolean }> {
  let deputies: RawDeputy[];
  let nameBySigla = new Map<string, string>();
  let live = true;

  try {
    const partiesJson = await fetchJson<CamaraList<{ sigla: string; nome: string }>>(
      `${CAMARA_API}/partidos?itens=100&ordem=ASC&ordenarPor=sigla`,
    );
    for (const p of partiesJson.dados ?? []) nameBySigla.set(p.sigla, p.nome);

    const depJson = await fetchJson<CamaraList<RawDeputy>>(
      `${CAMARA_API}/deputados?ordem=ASC&ordenarPor=nome&itens=${DEPUTY_COUNT}`,
    );
    deputies = (depJson.dados ?? []).slice(0, DEPUTY_COUNT);
    if (deputies.length === 0) throw new Error("nenhum deputado retornado");
  } catch (err) {
    console.warn(`  ⚠ Câmara API indisponível (${(err as Error).message}); usando snapshot offline.`);
    deputies = FALLBACK_DEPUTIES;
    nameBySigla = new Map();
    live = false;
  }

  const senators = await fetchSenators();
  const partyName = (s: string) => nameBySigla.get(s) ?? PARTY_NAMES[s] ?? s;

  const agents: SeedAgent[] = [
    ...deputies.map(deputyToAgent),
    ...senators.map(senatorToAgent),
    {
      ref: PRESIDENT.ref,
      firstName: PRESIDENT.firstName,
      lastName: PRESIDENT.lastName,
      type: AgentType.PRESIDENT,
      partyRef: partyRef(PRESIDENT.partySigla),
      imageUrl: PRESIDENT.imageUrl,
    },
  ];

  const siglas = [
    ...deputies.map((d) => d.siglaPartido),
    ...senators.map((s) => s.sigla),
    PRESIDENT.partySigla,
  ];
  const parties = buildParties(siglas, partyName);

  return { parties, agents, live };
}

interface SeedTheme {
  ref: string;
  name: string;
  summary: string;
  scope: Scope;
  state?: string;
  economic: number; // -1..1
  social: number; // -1..1
  articles: Array<{ ref: string; title: string; url: string }>;
}

const THEMES: SeedTheme[] = [
  {
    ref: "seed:theme:tax-reform",
    name: "Reforma Tributária Simplificada",
    summary: "Unificação de tributos sobre consumo com alíquota única.",
    scope: Scope.NATIONAL,
    economic: 0.7,
    social: 0.1,
    articles: [
      { ref: "seed:art:tax-1", title: "Texto-base da reforma", url: "https://example.gov.br/themes/tax/base" },
      { ref: "seed:art:tax-2", title: "Estudo de impacto", url: "https://example.gov.br/themes/tax/impacto" },
    ],
  },
  {
    ref: "seed:theme:public-childcare",
    name: "Expansão de Creches Públicas",
    summary: "Financiamento federal para ampliar a rede pública de creches.",
    scope: Scope.NATIONAL,
    economic: -0.8,
    social: -0.4,
    articles: [{ ref: "seed:art:childcare-1", title: "Projeto de lei", url: "https://example.gov.br/themes/creches/pl" }],
  },
  {
    ref: "seed:theme:state-privatization",
    name: "Privatização de Estatais de Energia",
    summary: "Venda do controle acionário de distribuidoras estaduais.",
    scope: Scope.NATIONAL,
    economic: 0.9,
    social: 0.2,
    articles: [
      { ref: "seed:art:priv-1", title: "Modelo de desestatização", url: "https://example.gov.br/themes/priv/modelo" },
      { ref: "seed:art:priv-2", title: "Parecer econômico", url: "https://example.gov.br/themes/priv/parecer" },
    ],
  },
  {
    ref: "seed:theme:data-privacy",
    name: "Proteção de Dados e Privacidade Digital",
    summary: "Reforço de garantias individuais sobre uso de dados pessoais.",
    scope: Scope.NATIONAL,
    economic: -0.1,
    social: 0.8,
    articles: [{ ref: "seed:art:privacy-1", title: "Substitutivo", url: "https://example.gov.br/themes/dados/substitutivo" }],
  },
  {
    ref: "seed:theme:community-policing",
    name: "Conselhos Comunitários de Segurança",
    summary: "Gestão compartilhada da segurança com base nas comunidades locais.",
    scope: Scope.STATE,
    state: "SP",
    economic: -0.2,
    social: -0.7,
    articles: [{ ref: "seed:art:police-1", title: "Marco estadual", url: "https://example.gov.br/themes/seguranca/marco" }],
  },
  {
    ref: "seed:theme:carbon-tax",
    name: "Tributação sobre Emissões de Carbono",
    summary: "Precificação de carbono para grandes emissores.",
    scope: Scope.NATIONAL,
    economic: -0.5,
    social: -0.3,
    articles: [
      { ref: "seed:art:carbon-1", title: "Proposta de precificação", url: "https://example.gov.br/themes/carbono/proposta" },
      { ref: "seed:art:carbon-2", title: "Relatório ambiental", url: "https://example.gov.br/themes/carbono/relatorio" },
      { ref: "seed:art:carbon-3", title: "Audiência pública", url: "https://example.gov.br/themes/carbono/audiencia" },
    ],
  },
  {
    ref: "seed:theme:labor-flexibility",
    name: "Flexibilização das Jornadas de Trabalho",
    summary: "Ampliação de modelos de jornada e contratação.",
    scope: Scope.NATIONAL,
    economic: 0.6,
    social: 0.5,
    articles: [{ ref: "seed:art:labor-1", title: "Texto consolidado", url: "https://example.gov.br/themes/trabalho/texto" }],
  },
  {
    ref: "seed:theme:basic-income",
    name: "Renda Básica Permanente",
    summary: "Transferência de renda incondicional a famílias de baixa renda.",
    scope: Scope.NATIONAL,
    economic: -0.9,
    social: -0.2,
    articles: [{ ref: "seed:art:income-1", title: "PEC da renda básica", url: "https://example.gov.br/themes/renda/pec" }],
  },
  {
    ref: "seed:theme:school-autonomy",
    name: "Autonomia Curricular das Escolas",
    summary: "Maior liberdade para escolas definirem parte do currículo.",
    scope: Scope.STATE,
    state: "MG",
    economic: 0.2,
    social: 0.6,
    articles: [{ ref: "seed:art:school-1", title: "Diretrizes", url: "https://example.gov.br/themes/escola/diretrizes" }],
  },
  {
    ref: "seed:theme:public-transport",
    name: "Tarifa Zero no Transporte Público",
    summary: "Gratuidade do transporte coletivo municipal.",
    scope: Scope.MUNICIPAL,
    economic: -0.7,
    social: -0.5,
    articles: [{ ref: "seed:art:transit-1", title: "Estudo de custeio", url: "https://example.gov.br/themes/transporte/custeio" }],
  },
  {
    ref: "seed:theme:startup-deregulation",
    name: "Desregulamentação para Startups",
    summary: "Redução de exigências para empresas nascentes.",
    scope: Scope.NATIONAL,
    economic: 0.8,
    social: 0.4,
    articles: [{ ref: "seed:art:startup-1", title: "Marco legal", url: "https://example.gov.br/themes/startup/marco" }],
  },
  {
    ref: "seed:theme:cultural-quota",
    name: "Cotas para Produção Cultural Local",
    summary: "Reserva de fomento para produções culturais regionais.",
    scope: Scope.STATE,
    state: "BA",
    economic: -0.3,
    social: -0.6,
    articles: [
      { ref: "seed:art:culture-1", title: "Lei de incentivo", url: "https://example.gov.br/themes/cultura/incentivo" },
      { ref: "seed:art:culture-2", title: "Anexo orçamentário", url: "https://example.gov.br/themes/cultura/anexo" },
    ],
  },
];

// ─── Upsert helpers (natural keys) ───────────────────────────────────────────

/** Upsert a seed party; returns internal id. */
async function seedParty(p: SeedParty): Promise<string> {
  const row = await db.party.upsert({
    where: { source_externalRef: { source: SRC, externalRef: p.ref } },
    create: {
      kid: kid("pty"),
      name: p.name,
      acronym: p.acronym,
      description: p.description,
      logoUrl: p.logoUrl,
      source: SRC,
      externalRef: p.ref,
    },
    update: { name: p.name, acronym: p.acronym, description: p.description, logoUrl: p.logoUrl },
    select: { id: true },
  });
  return row.id;
}

/** Upsert a seed agent; returns internal id. */
async function seedAgent(a: SeedAgent, partyId: string): Promise<string> {
  const row = await db.publicAgent.upsert({
    where: { source_externalRef: { source: SRC, externalRef: a.ref } },
    create: {
      kid: kid("agt"),
      firstName: a.firstName,
      lastName: a.lastName,
      type: a.type,
      state: a.state,
      municipality: a.municipality,
      imageUrl: a.imageUrl,
      email: a.email,
      partyId,
      source: SRC,
      externalRef: a.ref,
    },
    update: {
      firstName: a.firstName,
      lastName: a.lastName,
      type: a.type,
      state: a.state,
      municipality: a.municipality,
      imageUrl: a.imageUrl,
      email: a.email,
      partyId,
    },
    select: { id: true },
  });
  return row.id;
}

/** Upsert a seed theme with dimensions; returns internal id. Tallies reset to 0. */
async function seedTheme(t: SeedTheme): Promise<string> {
  const dimensions: Prisma.InputJsonValue = { economic: t.economic, social: t.social };
  const row = await db.theme.upsert({
    where: { source_externalRef: { source: SRC, externalRef: t.ref } },
    create: {
      kid: kid("thm"),
      name: t.name,
      summary: t.summary,
      scope: t.scope,
      state: t.state,
      dimensions,
      source: SRC,
      externalRef: t.ref,
    },
    update: {
      name: t.name,
      summary: t.summary,
      scope: t.scope,
      state: t.state,
      dimensions,
      // Reset tallies; we recompute them deterministically below.
      yesCount: 0,
      noCount: 0,
      absCount: 0,
    },
    select: { id: true },
  });
  return row.id;
}

/** Upsert a seed article attached to a theme. */
async function seedArticle(
  art: { ref: string; title: string; url: string },
  themeId: string,
): Promise<void> {
  await db.article.upsert({
    where: { source_externalRef: { source: SRC, externalRef: art.ref } },
    create: {
      kid: kid("art"),
      title: art.title,
      originalUrl: art.url,
      themeId,
      source: SRC,
      externalRef: art.ref,
    },
    update: { title: art.title, originalUrl: art.url, themeId },
  });
}

/** Upsert an AGENT vote (idempotent on source/externalRef). */
async function seedAgentVote(
  ref: string,
  themeId: string,
  agentId: string,
  value: VoteValue,
): Promise<void> {
  await db.vote.upsert({
    where: { source_externalRef: { source: SRC, externalRef: ref } },
    create: {
      value,
      voterType: VoterType.AGENT,
      themeId,
      agentId,
      source: SRC,
      externalRef: ref,
    },
    update: { value },
  });
}

/** Upsert a USER vote (idempotent on source/externalRef). */
async function seedUserVote(
  ref: string,
  themeId: string,
  userId: string,
  cpfHash: string,
  value: VoteValue,
): Promise<void> {
  await db.vote.upsert({
    where: { source_externalRef: { source: SRC, externalRef: ref } },
    create: {
      value,
      voterType: VoterType.USER,
      themeId,
      userId,
      cpfHash,
      source: SRC,
      externalRef: ref,
    },
    update: { value },
  });
}

/** Accumulate a vote into a per-theme tally bucket. */
function addTally(
  tallies: Map<string, { yes: number; no: number; abs: number }>,
  themeId: string,
  value: VoteValue,
): void {
  const t = tallies.get(themeId) ?? { yes: 0, no: 0, abs: 0 };
  if (value === VoteValue.YES) t.yes++;
  else if (value === VoteValue.NO) t.no++;
  else t.abs++;
  tallies.set(themeId, t);
}

// ─── Seed run ────────────────────────────────────────────────────────────────

/** Sample citizens with valid test CPFs (CLAUDE.md-compliant: only first/last name clear). */
const CITIZENS = [
  { ref: "seed:user:ana", firstName: "Ana", lastName: "Cidadã", cpf: "52998224725" },
  { ref: "seed:user:bruno", firstName: "Bruno", lastName: "Eleitor", cpf: "11144477735" },
];

const ADMIN = {
  firstName: "Admin",
  lastName: "Votto",
  email: "admin@votto.gov.br",
  password: "Votto@2026",
};

/**
 * Remove seed-origin agents/parties left over from previous seed versions (e.g.
 * the old synthetic "Agente Demo" roster) that are no longer in the current
 * roster, so re-seeding yields ONLY the real data. Their votes are removed first.
 */
async function cleanupStaleSeed(
  currentAgentRefs: Set<string>,
  currentPartyRefs: Set<string>,
): Promise<{ agents: number; parties: number }> {
  const seedAgents = await db.publicAgent.findMany({
    where: { source: SRC, externalRef: { startsWith: "seed:agent:" } },
    select: { id: true, externalRef: true },
  });
  const staleAgents = seedAgents.filter(
    (a) => !a.externalRef || !currentAgentRefs.has(a.externalRef),
  );
  if (staleAgents.length > 0) {
    const ids = staleAgents.map((a) => a.id);
    await db.vote.deleteMany({ where: { agentId: { in: ids } } });
    await db.publicAgent.deleteMany({ where: { id: { in: ids } } });
  }

  const seedParties = await db.party.findMany({
    where: { source: SRC, externalRef: { startsWith: "seed:party:" } },
    select: { id: true, externalRef: true },
  });
  const staleParties = seedParties.filter(
    (p) => !p.externalRef || !currentPartyRefs.has(p.externalRef),
  );
  if (staleParties.length > 0) {
    await db.party.deleteMany({ where: { id: { in: staleParties.map((p) => p.id) } } });
  }

  return { agents: staleAgents.length, parties: staleParties.length };
}

/** Run the full idempotent seed and print a concise summary. */
async function main(): Promise<void> {
  console.log("▶ Semeando dados (idempotente)…");

  // 0) Real roster: deputies (Câmara) + senators (Senado) + President.
  const roster = await buildRoster();
  console.log(
    `  • Fonte do roster: ${roster.live ? "dados reais (Câmara/Senado)" : "snapshot offline verificado"}`,
  );

  // 0b) Drop stale synthetic agents/parties from older seed versions.
  const removed = await cleanupStaleSeed(
    new Set(roster.agents.map((a) => a.ref)),
    new Set(roster.parties.map((p) => p.ref)),
  );
  if (removed.agents > 0 || removed.parties > 0) {
    console.log(`  • Limpeza: ${removed.agents} agentes e ${removed.parties} partidos antigos removidos`);
  }

  // 1) Parties (real)
  const partyIdByRef = new Map<string, string>();
  for (const p of roster.parties) partyIdByRef.set(p.ref, await seedParty(p));

  // 2) Agents (real federal deputies, with photos)
  const agentIds: string[] = [];
  for (const a of roster.agents) {
    const partyId = partyIdByRef.get(a.partyRef);
    if (!partyId) continue;
    agentIds.push(await seedAgent(a, partyId));
  }

  // 3) Themes + Articles
  const themeIds: string[] = [];
  for (const t of THEMES) {
    const themeId = await seedTheme(t);
    themeIds.push(themeId);
    for (const art of t.articles) await seedArticle(art, themeId);
  }

  // 4) Agent votes (deterministic) + accumulate tallies.
  const tallies = new Map<string, { yes: number; no: number; abs: number }>();
  let agentVoteCount = 0;
  for (let ai = 0; ai < agentIds.length; ai++) {
    for (let ti = 0; ti < themeIds.length; ti++) {
      const value = pickVote(ai, ti);
      if (value === null) continue;
      await seedAgentVote(`seed:vote:agent:${ai}:theme:${ti}`, themeIds[ti], agentIds[ai], value);
      addTally(tallies, themeIds[ti], value);
      agentVoteCount++;
    }
  }

  // 5) Citizen users + their votes (a handful each).
  let userVoteCount = 0;
  for (let ui = 0; ui < CITIZENS.length; ui++) {
    const c = CITIZENS[ui];
    const cpf = deriveCpfFields(c.cpf);
    const user = await db.user.upsert({
      where: { cpfHash: cpf.cpfHash },
      create: {
        kid: kid("usr"),
        firstName: c.firstName,
        lastName: c.lastName,
        cpfEncrypted: cpf.cpfEncrypted,
        cpfHash: cpf.cpfHash,
        cpfPrefix: cpf.cpfPrefix,
      },
      update: { firstName: c.firstName, lastName: c.lastName },
      select: { id: true },
    });

    // Vote on the first 7 themes deterministically.
    for (let ti = 0; ti < Math.min(7, themeIds.length); ti++) {
      const r = hashStr(`u${ui}:t${ti}`) % 3;
      const value = r === 0 ? VoteValue.YES : r === 1 ? VoteValue.NO : VoteValue.ABSTENTION;
      await seedUserVote(
        `seed:vote:user:${ui}:theme:${ti}`,
        themeIds[ti],
        user.id,
        cpf.cpfHash,
        value,
      );
      addTally(tallies, themeIds[ti], value);
      userVoteCount++;
    }
  }

  // 6) Persist computed theme tallies (we control all inserts → set absolute values).
  for (const themeId of themeIds) {
    const t = tallies.get(themeId) ?? { yes: 0, no: 0, abs: 0 };
    await db.theme.update({
      where: { id: themeId },
      data: { yesCount: t.yes, noCount: t.no, absCount: t.abs },
    });
  }

  // 7) Sync party agentCount.
  for (const partyId of partyIdByRef.values()) {
    const count = await db.publicAgent.count({ where: { partyId } });
    await db.party.update({ where: { id: partyId }, data: { agentCount: count } });
  }

  // 8) Administrator.
  const passwordHash = await hashPassword(ADMIN.password);
  await db.administrator.upsert({
    where: { email: ADMIN.email },
    create: {
      kid: kid("adm"),
      firstName: ADMIN.firstName,
      lastName: ADMIN.lastName,
      email: ADMIN.email,
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
    },
    update: { firstName: ADMIN.firstName, lastName: ADMIN.lastName, role: AdminRole.SUPER_ADMIN },
  });

  // Summary.
  const byType = (t: AgentType) => roster.agents.filter((a) => a.type === t).length;
  console.log("✓ Seed concluído:");
  console.log(`   • Partidos:   ${partyIdByRef.size} (reais, com logo)`);
  console.log(
    `   • Agentes:    ${agentIds.length} reais — ${byType(AgentType.FEDERAL_DEPUTY)} deputados, ` +
      `${byType(AgentType.SENATOR)} senadores, ${byType(AgentType.PRESIDENT)} presidente`,
  );
  console.log(`   • Temas:      ${themeIds.length}`);
  console.log(`   • Votos agentes: ${agentVoteCount}`);
  console.log(`   • Cidadãos:   ${CITIZENS.length} (votos: ${userVoteCount})`);
  console.log("");
  console.log("   Administrador (use para login):");
  console.log(`     e-mail: ${ADMIN.email}`);
  console.log(`     senha:  ${ADMIN.password}`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (err) => {
    console.error("✗ Falha no seed:", err);
    await db.$disconnect();
    process.exit(1);
  });
