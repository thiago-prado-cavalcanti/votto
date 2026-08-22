# Votto

> Direct-democracy platform: citizens vote on political themes, and the system measures how
> aligned public agents and parties are with each citizen's choices.

This file is the source of truth for the project's vision, scope, data model, and engineering
conventions. Keep it updated as decisions evolve.

---

## 1. Vision

Votto proposes a **complement** to representative democracy — not a replacement.

Representative democracy exists because, historically, a population could not deliberate directly
on every law and executive action, so it elected representatives. That constraint is now largely
technical, and can be complemented by a platform that lets each citizen express direct opinions on
**national, state, and municipal** themes.

The goal is **not** to remove the current democratic structure, but to:

- Help **citizens** identify how aligned their elected officials are with their own positions.
- Help **elected officials** understand and align with their constituents.

Votto gives the population a complementary channel of expression alongside the existing political
structures.

---

## 2. Product Scope (MVP)

This is an **MVP**. It does not need to be extremely high-performance yet, but the architecture
**must** anticipate evolution to thousands of daily queries and millions of users.

Guiding principles:

- **Security first.** A leak must expose nothing beyond first and last name.
- **Systemic simplicity.** Simplicity brings code clarity and removes security gaps. Prefer the
  simplest design that satisfies the requirement.
- **Minimal data collection.** Store the absolute minimum about citizens.
- **Scalability path.** Easy to port/scale later without a rewrite.

### Backend (admin) pages

- **Login**
- **Dashboard** — statistics for users, parties, public agents, themes, and votes.
- **Public agents** — CRUD + block.
- **Parties** — CRUD + block.
- **Themes** — CRUD + block (with multi-article upload).
- **Administrators** — CRUD + block.

### Frontend (public) pages

- **Home** — impactful, concise pitch of the project; key statistics; list of "hot" themes; quick
  vote action on hot themes.
- **Login** — authentication via official Brazilian identity providers only.
- **Public agents** — list of registered agents with party, general info, and (the key feature) the
  **Alignment Index** and **Political Positioning Index**. Filters and sorting.
- **Public agent (detail)** — full detail of one agent.
- **Themes** — list with a "temperature" index, vote counts, and filters. Vote action.
- **Theme (detail)** — full detail of one theme. Vote action.

---

## 3. Core Features — The Indexes

This is the heart of the platform and the main performance challenge.

### 3.1 Alignment Index (primary feature)

For the **currently logged-in user**, compute how aligned each public agent and each party is with
that user's voting record.

- A vote on a theme is one of: **yes**, **no**, **abstention**.
- Numeric mapping: `yes = +1`, `no = -1`, `abstention = 0`.
- Compare the user's votes with an agent's votes over the **set of themes both have voted on**.
- Score: agreement-based similarity normalized to **0–100%**. (Start with weighted agreement /
  cosine similarity over the shared theme set; revisit weighting later, e.g. by theme importance.)
- **Party alignment** = aggregation of its agents' positions (or the party's official position when
  available).

**Performance design (must be dynamic and scalable):**

- An agent/party has **one position per theme**, so agent vote vectors are small and stable —
  precompute and cache them.
- The user's vote vector is also small (only themes they voted on).
- Compute alignment **on demand per logged-in user**, against precomputed agent/party vectors.
- Cache results (e.g. Redis) keyed by `userVoteVersion` so they invalidate when the user votes.
- Consider materialized aggregates / incremental updates as volume grows. Do **not** recompute
  global similarity for every request from raw votes.

### 3.2 Political Positioning Index (secondary feature)

Position users, public agents and parties on the classic left↔right political spectrum, using a
**5-point scale**:

> Esquerda · Centro-esquerda · Centro · Centro-direita · Direita

- Each theme is tagged with value dimensions on two underlying axes — **economic** (Estado ↔ Mercado)
  and **social** (Comunidade ↔ Indivíduo), each weighted −1..1.
- A person's votes are aggregated per axis (YES pushes toward the tag, NO away, ABSTENTION ignored),
  normalized to −100..100, then combined into a single **spectrum** score (economic-weighted) that
  maps to one of the five bands. Implementation: `src/lib/indexes/positioning.ts`.
- The two axes are retained for a supporting two-axis positioning chart.

> **The five-band verdict is NOT displayed anywhere today.** The maths is only as good as the
> themes' axis tags, and those are not filled in yet (§11) — running on near-empty weights it was
> placing PL at the centre. A wrong band stated in confident type is worse than no band at all, so
> `PositionBadge` and `SpectrumBar` are unmounted (both files kept, with a note) and the band is
> gone from the cards, the detail pages, the embeds and the OG cards. What remains is the two-axis
> **figure**, which shows a shape rather than pronouncing a sentence. Put the band back only once
> theme tagging exists and the output has been checked against parties whose position is not in
> dispute.

> The data architecture is **not rigid**. Propose improvements where pertinent — especially around
> how themes map to positioning dimensions.

---

## 4. Data Model

> Database, tables, columns, and **all code must be in English**. The schema below is a starting
> point; suggest improvements where they help clarity, security, or scale.

**Preferred database: PostgreSQL.**

### Entities

- **PublicAgent** — deputies, councillors, governors, senators, etc.
  Fields: first name, last name, email, phone, image, description, CPF, type (deputy, councillor,
  governor, senator, …), state, municipality, plus `externalUrl`, `legislature` and `inOffice`
  (false once the mandate ends — the record and its votes are kept, see §8). Belongs to a **Party**.
  Agent CPF is **not** imported even where a source publishes it: the source's own id already
  establishes identity, so collecting it would add risk for nothing.
- **Party** — first/display name, description, logo, official leader/website/head count, plus
  denormalized counts (number of deputies, governors, councillors, etc., kept for fast dashboards).
  A party exists **once** across houses, keyed by acronym.
- **Theme** — political amendments, laws, etc. Fields: name, summary. Has many **Articles**.
  Imported themes additionally carry their official record: `identifier` (e.g. "PL 3085/2026"),
  `house`, `externalUrl`, `situation`, `urgency` (procedural regime), `priority` (0–100, see §8),
  `classifications`, `keywords`, `inProgress`, `presentedAt`, `lastActionAt`.
- **Article** — always connected to a Theme. Fields: link to original article, link to download the
  original article, foreign key to Theme.
- **Vote** — a vote on a Theme. Value: abstention / yes / no. Cast by a **User** or a **PublicAgent**.
  Unique: **one vote per CPF per Theme**.
- **User** — citizen / voter. Fields: first name, last name, CPF (encrypted, see §5), birth date
  (encrypted — needed by the vote challenge), birth **year** in clear (age gate + anonymized
  demographics), and the verification trail `cpfVerifiedAt` / `cpfVerificationSource`.
- **SocialAccount** — a social identity (`provider` + the provider's `sub`) bound to a User. Many
  per User: linking Google and Apple to one CPF is one citizen, not two. Written only once a CPF
  has been confirmed. `subject` is internal, exactly like `externalRef` (§5).
- **Administrator** — backend login. Fields: first name, last name, email, mobile, password (hashed),
  role, image.

### Themes & Articles ingestion

- A Theme can be created with **multiple Articles**.
- Ingestion can be **manual** (admin upload) **or automated** via the official-source integration
  (§8) — both paths converge on the same model.
- When an Article is ingested (manually or imported), it must pass through an **AI step** that reads
  the article and **incrementally enriches the Theme's summary**.

---

## 5. Security & Privacy (non-negotiable)

### Minimal data

- The only personal data we keep for a citizen, in clear, is **first name and last name**.
- In case of a leak, **nothing beyond first/last name** must be readable.

### CPF handling

- **CPF must be stored encrypted** (reversible encryption with a managed key — never plaintext).
- Add a separate column holding **only the first six digits of the CPF in clear** (the partial CPF),
  for low-sensitivity display/analytics. (Six digits alone do not identify a person.)
- **One vote per CPF per theme** must be enforced **without** comparing plaintext CPFs: store a
  **deterministic keyed hash (HMAC) of the CPF** and put the uniqueness constraint on
  `(cpf_hash, theme_id)`. The HMAC enables dedup without revealing or decrypting the CPF.

  Suggested columns on `User` / `Vote`:
  - `cpf_encrypted` — reversible, for the rare authorized retrieval.
  - `cpf_hash` — deterministic HMAC, for uniqueness/dedup (`UNIQUE(cpf_hash, theme_id)` on votes).
  - `cpf_prefix` — first six digits, clear.

### Authentication

Citizen sign-in is **two steps**, because neither one is sufficient alone:

1. **Social provider** — Apple, Google or Meta (OIDC authorization-code + PKCE). Proves the person
   controls that account; says nothing about who they are in Brazil. One client
   (`src/lib/auth/social/oidc.ts`) driven by a registry (`src/lib/auth/social/providers.ts`).
2. **Official CPF registry** — the citizen types **first name, last name, CPF and birth date**, and
   `src/lib/identity/validation.ts` confirms them together against the Receita Federal.

   The name is checked against the **registry**, never against the provider's display name: that
   one is self-declared and editable, so comparing with it would be theatre — a mismatch proves
   nothing (nicknames) and a match proves nothing (an attacker edits the field). What the check
   buys is that the citizen must *know* the name behind the CPF.

   It asks for the first name and the **last** surname, and means it. Accepting any surname was
   the first cut and it was wrong: the middle surname is exactly the one that circulates socially
   — someone is publicly `Thiago Prado` while the record ends in `Cavalcanti` — so against the
   realistic attacker (a relative, a colleague) the final surname is the part that lives on the
   document rather than in conversation. Forgiving only where names are *written* differently:
   accents, case, and generational suffixes (`SILVA JÚNIOR` takes either). `nameMatchesRegistry`
   in `src/lib/domain/names.ts`.

Voting adds a third check, **once per session** (`src/lib/auth/vote-challenge.ts`): before the
first vote, the citizen answers with three digits of their CPF, given by position, plus the day,
month or year of their birth. The combination is drawn fresh each time. It is not a second
password — it is what stops an unlocked phone or a forgotten session on a shared computer from
voting in someone's name. The answer is recorded as a claim on the session token, so it dies with
the session by construction. Three attempts per challenge, three challenges per session, then a
fresh login.

Identity reaches the database only through `signInCitizen`
(`src/lib/auth/citizen-login.ts`), which owns the CPF privacy rules, and identity is always read
from the **signature-verified** id_token, never the query string.

- **Users cannot create passwords.** No credential sign-up, nothing to steal.
- **gov.br is not available and its code was removed.** Login Único would be the better door — it
  hands over an already-verified CPF — but it is granted only to public institutions on `.gov.br`
  domains. It was deleted rather than left dormant: its mock callback minted a session from a form
  and defaulted to `mock`, which is an authentication bypass waiting on a misconfigured deploy.
- **Be honest about the assurance this buys.** It establishes that the CPF is real and regular —
  which is what stops votes cast under generated numbers. It does **not** establish possession:
  someone who knows a relative's CPF and birthday passes. This is the accepted starting position
  until a stronger binding exists; `User.cpfVerificationSource` records which registry answered, so
  accounts created under a weak (or `mock`) rule stay identifiable afterwards.
- **A Pix of R$0,01** would anchor identity to a bank account (the bank returns a verified name and
  a masked CPF). Evaluated and deferred — sending someone into their banking app mid-signup
  collapses conversion. It remains the most likely next step.
- **No e-mail is stored** even though every provider offers one: it would put a second identifier
  beyond the name into a leak.
- **The birth date is stored encrypted**, because the challenge asks for the day or the month; a
  challenge that could only ask for the year would repeat the same two digits forever. Only the
  **year** is readable in the database.
- **Nothing is written before the CPF confirms.** The social identity waits in a signed, httpOnly
  cookie (`src/lib/auth/pending.ts`), which also carries an attempt counter — each attempt is a paid
  registry lookup, so the cap guards the budget as much as it guards against brute force.
- **Bank identity has no direct path.** Brazilian banks expose no public identity API; each would
  need a bilateral commercial agreement. A future bank IdP plugs in as another `ProviderConfig`.
- A development-only mock IdP (`/dev-idp`) stands in for every provider; it 404s and the callback
  refuses its form whenever `SOCIAL_MODE != mock`, so a half-finished production switch fails closed.
- **Administrators** authenticate with email + hashed password (separate from citizen auth).

### Internal IDs must never leave the system (global rule)

- **Never** return internal `id` / `*Id` / `*_id` in any API response, external integration,
  notification, email, webhook, or third-party log — for the main entity **and** any nested relation.
- External-facing identifiers:
  - `kid` — short id, for small/simple resources.
  - `tsuuid` — timestamped UUID, for larger/complex resources; prefer `tsuuid` when an external
    integration needs an idempotency key.
- When mapping entity → response DTO, explicitly omit `id` / `*Id` / `*_id`, recursively for relations.

### Database operations (global rule)

- **Never** execute SQL or run migrations against any database from this environment.
- Deliver the change instead as a **Prisma migration** under `prisma/migrations/<timestamp>_name/
  migration.sql`, with a readable mirror in `docs/migrations/`. The deploy workflow runs
  `prisma migrate deploy` before the new image serves traffic, so a plain `git push` applies it —
  **that is the only update procedure**, and it holds for data fixes (backfills, corrections) just
  as much as for DDL. Write them idempotent, so a re-run is a no-op.
- A statement that cannot be a migration goes in the plan for the user to run. Never leave a change
  that requires them to open a database console as the normal path.

---

## 6. Backend Methods

Each method **must have a description** (doc comment). Required operations:

- Create, edit, **block**, and delete **Public agents**.
- Create, edit, **block**, and delete **Parties**.
- Create, edit, **block**, and delete **Themes**.
- Create, edit, **block**, and delete **Administrators**.
- **Vote**.

> "Block" is a soft state distinct from delete (e.g. `status` / `blocked_at`), so an entity can be
> hidden without losing history (important for vote integrity).

---

## 7. Architecture & Stack

> The user asked Votto to choose the best stack for SSR, simplicity, and a Brazil-located host with
> an easy path to scale. Decisions below — revisit as needed.

- **Framework:** **Next.js (App Router)** — server-side rendering, one codebase for the public
  frontend and the admin backend, mature ecosystem.
- **Language:** TypeScript everywhere.
- **Database:** **PostgreSQL**.
- **ORM:** Prisma (clear schema, typed queries, managed migrations). All migrations handed to the
  user for manual execution per the global DB rule.
- **Cache / index acceleration:** Redis (alignment-index caching, hot themes).
- **AI step:** Claude (latest model) for incremental theme-summary enrichment from uploaded articles.
- **Auth:** one OIDC client serving Apple / Google / Meta (citizens), followed by CPF
  confirmation against the official registry; credential + session auth for administrators.
- **Sync worker:** a separate long-running container running the weekly official-source jobs
  (`scripts/worker.ts`) plus a one-off historical loader (`scripts/backfill.ts`), kept out of the web process so multi-minute imports never compete with
  request handling and a redeploy doesn't interrupt a running import.

### Hosting (Brazil-located, simple, scalable)

- **Recommendation:** start on a host with a **Brazil region** for low latency, simple ops, and an
  easy scale-up path. Candidates: **Fly.io (`gru` — São Paulo)** for MVP simplicity, or
  **AWS `sa-east-1` (São Paulo)** when more control is needed (App Runner/ECS + RDS Postgres).
- Keep infrastructure portable (containerized, env-driven config) so moving to a higher-capacity
  Brazilian infra is straightforward.

---

## 8. Integration (official sources)

Themes, articles, and **public-agent votes** must be importable from — and continuously monitored
against — official Brazilian sources, instead of relying only on manual upload. Public open-data
APIs exist for this and require no authentication.

### Sources

- **Câmara dos Deputados — Dados Abertos API v2** — `https://dadosabertos.camara.leg.br/api/v2`
  (REST, JSON, no auth, refreshed daily). Collections in use:
  - `proposicoes` (+ `/{id}`, `/{id}/temas`) → **Theme**, with urgency regime, situation and the
    official subject classification.
  - `votacoes` (+ `/{id}`, `/{id}/votos`) → **public-agent Votes**.
  - `deputados`, `partidos` (+ `/{id}`) → **PublicAgent** / **Party**.
- **Senado Federal — Dados Abertos** — `https://legis.senado.leg.br/dadosabertos` (XML by default;
  JSON via `Accept: application/json`). Resources in use:
  - `processo` (+ `/{id}`) → **Theme**, with situation and classification hierarchy.
  - `votacao` → **public-agent Votes** (nominal roll calls, votes embedded).
  - `senador/lista/atual`, `composicao/lista/partidos` → **PublicAgent** / **Party**.
- ⚠️ The legacy `materia/*` family is **deprecated** (2025-03-18; shutdown 2026-02-01) in favour of
  `/processo`. Do not build on it.
- Keep the source list **extensible** for other official bodies (state assemblies, municipal
  chambers, TSE, etc.) behind a common importer interface.

### Source quirks that constrain the design

Verified against the live APIs; `npm run check:sources` re-checks them.

- Câmara `votacoes` list returns `uriProposicaoObjeto: null` almost always — resolve the voted bill
  from the detail endpoint's `proposicoesAfetadas`.
- Only the **Plenário** (`idOrgao=180`) has nominal votes; committee decisions return `votos: []`
  (sometimes 404).
- Câmara `votacoes` rejects date ranges wider than **3 months** — chunk any look-back.
- Senado `processo?numdias=` is capped at **30 days**.
- A party must exist **once** across both houses: the Senado importer reuses a party already
  imported by the Câmara when the acronym matches.

### Mapping to the data model

- Official bill/amendment → **Theme** (name + summary). Attached official documents/links →
  **Article** (original link + download link); each imported Article still passes through the **AI
  enrichment step** (§4) that incrementally updates the Theme summary.
- Official roll-call vote → **Vote** cast by a **PublicAgent** (yes / no / abstention), mapped to our
  `+1 / -1 / 0` model.
- Official legislators/parties → **PublicAgent** / **Party** records.
- **Party logos are curated, not imported.** The Câmara's `{SIGLA}.gif` is the acronym in plain
  type for most parties and the Senado publishes none, so `src/lib/integration/party-logos.ts`
  maps acronym → SVG in `public/logos/partidos/` and `upsertParty` applies it, which is what keeps
  the marks correct across re-imports. Those SVGs are **built**, not collected: `npm run
  assets:party-logos` crops the party name off each official lockup and normalizes every mark onto
  one 2.5:1 canvas at constant area, so a 1:1 mark and a 7:1 mark carry the same optical weight —
  UI slots must be cut to that ratio. Pipeline and provenance:
  [`docs/logos-partidos.md`](docs/logos-partidos.md).

### Urgency & classification

Neither house publishes a ready-made urgency score, but both publish its inputs. `Theme.priority`
(0–100, `src/lib/domain/priority.ts`) folds procedural regime, current situation and recency into a
single rank that SQL can order by; concluded bills are capped at 10. Two calibration constraints,
found against the first real load: the base leaves headroom (35 of 42 bills on the Câmara floor carry
an "Urgência" regime, so a high base marks everything urgent and the badge stops informing), and the
houses must be comparable (the Senado publishes no regime, so its situation vocabulary supplies the
base instead — otherwise no Senado bill could ever out-rank a Câmara one). Retuning needs no
re-import: `npm run reprioritize` recomputes from stored columns. Bands: Urgente (≥80),
Prioritário (≥60), Tramitação normal (≥30), Baixa prioridade.

`Theme.classifications` stores the official subject taxonomy verbatim (Câmara `codTema`/`relevancia`,
Senado `classificacoes` with hierarchy). The source's numeric code stays internal — the DTO exposes
label, hierarchy and the "main subject" flag only.

### Sync design

- **Pull/polling** model: scheduled jobs query each source's "recently updated" endpoint, then fetch
  details only for changed items. No source pushes to us.
- **Idempotent upserts:** store each source's native identifier as an internal `source` +
  `external_ref` pair and upsert on it, so re-runs never duplicate. (These are the government's IDs,
  used only internally for dedup — they are **not** exposed externally; our public identifiers remain
  `kid` / `tsuuid` per §5.)
- **Relevance has to be derived.** Neither house ranks bills, and the Câmara's `/proposicoes` silently
  ignores `codSituacao`, so "the ones that matter" cannot be queried. The floor agenda is the closest
  proxy that exists: `*:agenda` jobs read `orgaos/180/eventos` → `eventos/{id}/pauta` (Câmara) and
  `processo?siglaSituacao=` (Senado, which does filter server-side). They overlap with the broad
  `*:themes` sweep on purpose — cheap high-signal first, exhaustive second.
- **One job per (source × domain)** — parties, agents, agenda, themes, votes — registered in
  `src/lib/integration/jobs.ts` and scheduled weekly (Sunday early morning, America/São_Paulo). Jobs
  are independent: an agent job creates a missing party, a vote job creates a missing agent, so
  running them out of order loses detail but never correctness.
- **Worker:** a dedicated container (`scripts/worker.ts`) runs the schedule, catches up on boot for
  any job idle >8 days, runs jobs sequentially and isolates failures. An authenticated
  `POST /api/cron/{job}` and the `/admin/sincronizacao` panel drive the same jobs manually.
- **Single flight:** each job holds a lock in `SyncJob` (4h lease, reclaimable) so a worker run and a
  manual trigger never import the same window concurrently.
- **Provenance & trust:** every imported theme keeps its official identifier, house, situation and a
  link back to the source page; `ImportRun` logs every attempt.
- **Resilience:** rate-limit, retry with backoff, tolerate source downtime without data loss. An
  agent run that returns nothing never retires the whole house.
- **Mandates end, history doesn't:** agents dropped from the official roster get `inOffice = false`
  instead of being deleted — their votes are what the alignment index is built from.
- **Contract check:** `npm run check:sources` asserts every field the importers read is still present
  in the live responses, without touching the database. Neither house versions its open data.

---

## 9. Design

> The full system — tokens, type, patterns, brand assets and a pre-ship checklist — lives in
> [`docs/design.md`](docs/design.md). It is the source of truth; this section is the intent.

**Positioning: "papel & pigmento".** Votto is a public institution that happens to be a website,
so it reads like a well-set document rather than a dashboard. Governmental gravitas with
high-end design quality (most Brazilian public-sector products are poorly made; Votto must not
be), but the reference is a printed record, not a fintech app.

- **Warm paper, never white** (`canvas #fcfaf6`). Structure is a **1px ink rule**, never a shadow.
- **Sober colors of Brazil, as pigment:** warm ink, **pinho** (institutional green), **terracota**
  (action) and **ocre** (highlight). Votes are moss / brick / stone; abstention is always neutral.
- **Newspaper serif (Newsreader) at weight 500** for every display size and for the indexes
  (`.vt-num`, tabular); **Instrument Sans** for labels, buttons, table headers and microcopy.
  There is no 700/800 weight in the system.
- **Paper folds, it does not round:** 4px corners (`--radius-card`), 2px on tags.
- **One decoration:** a 3.5% paper grain in multiply over the document. No auroras, no grids.
- Lists are documents: themes are an order paper with a voting panel, rankings are tables with an
  index column, filters are labelled rules with no box.
- **Every page opens on a masthead, not on a heading.** `PageIntro` (index pages) and `RecordIntro`
  (one agent, one party) are a full-bleed band on a deeper paper stock, closed by a hairline:
  eyebrow, display type one step under the home hero's, lead, action — and, on the right, a **plate
  of that page's own figures** (`IndexPlate` for a cut of one total, `ReadingPlate` for an index
  reading at full size). A masthead always carries a figure that exists: where alignment cannot be
  computed yet, the roll-call record stands in for it.
- **The party is a mark, not a tag.** The curated logos carry the acronym in the party's own
  lettering, so the acronym is never printed beside the mark — it is the fallback for a party with
  no curated mark. Marks always sit in a box bounded on both sides (proportions run from 6.5:1 to
  taller than wide).
- **Voting is the loudest thing on the page,** because it is the platform's action and its
  reading. The panel leads with the winning share in the serif numerals over a keyed tally
  (`TemperatureBar`), and the ballot is three equal columns filled solid with the vote pigments
  (`VoteButtons`), under a terracota prompt — the one place a card opens with a terracota rule.
- **Forms are ours, including the parts browsers usually keep.** One surface for every control
  (`src/components/ui/control.ts`) in two treatments — boxed in the admin, a printed rule in the
  public filters. `Select` replaces the OS dropdown with a paper listbox while the native
  `<select>` stays the field, so filtering still works without JavaScript; radio and checkbox are
  ink ballot marks. Never reach for a bare `<input>`, `<select>` or `type="radio"`.
- The **animated `AlignmentRadar`** is the brand made visible — and, until per-area alignment is
  computed, it is illustration, not a chart (see §11). `PositioningChart` is its **still form**:
  the same mass, hairlines and hand-drawn petal (geometry shared in `src/lib/viz/figure.ts`),
  leaning toward the quadrant a voting record points at.
- **A page is composed, not animated.** Blocks arrive with the scroll as ink settling on paper:
  the opener's rule draws itself, index bars enter from the left, the masthead rule fills with
  terracota as the document is read. One vocabulary (`src/components/public/motion.tsx` + the
  motion block in `globals.css`) covers every public screen. Two invariants: resting states live
  only inside `@media (scripting: enabled) and (prefers-reduced-motion: no-preference)`, so the
  page is never blank without JavaScript; and first-screen blocks play from CSS keyframes
  (`autoplay`) rather than waiting for hydration, so motion never costs LCP.
- Fully **responsive**; all motion honours `prefers-reduced-motion`.

---

## 10. Conventions

- All database objects, columns, and code are in **English**.
- Every backend method has a descriptive doc comment.
- Never expose internal IDs externally (§5).
- Never run DB statements/migrations from this environment (§5).
- Imported records are upserted idempotently by `(source, external_ref)`; never expose source IDs
  externally (§8).
- Prefer the simplest design that meets the requirement.

---

## 11. Open Questions / To Validate

- **Make the Political Positioning Index trustworthy before showing its band again** (§3.2). Order
  of work: tag themes on the two axes, then re-tune the economic/social weighting and the band
  thresholds, then validate against parties whose position is not in dispute — PL reading as
  "Centro" is the regression test.
- Exact similarity formula and theme weighting for the **Alignment Index**.
- Theme → positioning-dimension tagging model. The official classification now imported
  (`Theme.classifications`) is the obvious input to automate this — currently unused by the
  positioning index.
- Tune the **priority** weights in `src/lib/domain/priority.ts` against real editorial judgement.
- **Provider credentials:** register the app with Google, Apple and Meta and fill the `.env`
  (click-by-click: `docs/login-social-passo-a-passo.md`; rationale: `docs/integracao.md` §5). Google is the cheapest to get working and has the widest reach —
  start there. Apple needs a paid account and an https callback (it refuses http, even on
  localhost), so it needs a tunnel to test locally.
- **CPF registry contract:** verified end to end against the live Receita Federal registry on
  2026-08-22 (`npm run check:cpf`), and against the documented payload by `npm run
  check:cpf:contract`. What remains is configuration: `CPF_VALIDATION_PROVIDER=mock` accepts any
  well-formed CPF, so **production is still unverified** until the Infosimples token reaches
  `.env.production` (~R$0,24/lookup, R$100/month floor).
- **A real proof of CPF possession.** What ships is CPF + birth date against the registry, which
  proves the CPF is real but not that it is the person's. The Pix of R$0,01 is the deferred
  candidate; revisit before the platform's numbers are quoted as representative.
- Confirm hosting choice (Fly.io `gru` vs AWS `sa-east-1`).
- Which state/municipal bodies expose open data, and whether the AI enrichment step (§4) should run
  on the newly imported bills (it is not wired into the importers yet).
- **Per-area alignment** for the hero's `AlignmentRadar`: it needs themes grouped by policy area
  and the alignment maths run per group (the same computation as `citizenAgentAlignments`, only
  partitioned). Until then the radar's data is fictional and it stands as brand illustration —
  see `docs/design.md` §4.
- The two layouts the humanized study proposed but this pass did not apply: agent/party lists as
  tables, and the theme detail page with the official record as a marginal column
  (`docs/design.md` §7).
