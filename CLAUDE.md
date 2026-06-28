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

Position users and public agents on a political spectrum **without** the dated, polarizing labels
(far-right, right, center-right, center, center-left, left, far-left).

- We want a representation that is **non-pejorative** but still meaningful.
- **Proposal (to validate):** a multi-dimensional model where each theme is tagged with one or more
  value dimensions (e.g. economic, social, environmental, security, individual-vs-collective).
  Aggregate a person's votes per dimension into a position, and surface neutral, descriptive
  **profile names** instead of a single left↔right line.
- Keep the naming neutral and descriptive; the labels are a product/branding decision to be refined.

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
  governor, senator, …), state, municipality. Belongs to a **Party**.
- **Party** — first/display name, description, logo, plus denormalized counts (number of deputies,
  governors, councillors, etc., kept for fast dashboards).
- **Theme** — political amendments, laws, etc. Fields: name, summary. Has many **Articles**.
- **Article** — always connected to a Theme. Fields: link to original article, link to download the
  original article, foreign key to Theme.
- **Vote** — a vote on a Theme. Value: abstention / yes / no. Cast by a **User** or a **PublicAgent**.
  Unique: **one vote per CPF per Theme**.
- **User** — citizen / voter. Fields: first name, last name, CPF (encrypted, see §5).
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

- **Users cannot create accounts.** No sign-up flow, no stored credentials.
- Users log in **only via official Brazilian identity providers** that already pre-verify CPF, so we
  can trust the identity: **gov.br** and **banks** (OAuth2 / OpenID Connect).
- We rely on the provider's validated name + CPF; we never collect or verify CPF ourselves.
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

- **Never** execute SQL or run migrations against any database from this environment. Document
  required DDL/DML in the plan or in `docs/migrations/*.sql` and hand it to the user for manual
  execution.

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
- **Auth:** OIDC clients for **gov.br** and **bank** providers (citizens); credential + session auth
  for administrators.

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
  (REST, JSON, no auth, refreshed daily). Relevant collections:
  - `proposicoes` → **Theme** candidates (bills/amendments).
  - `votacoes` and their `votos` → **public-agent Votes** on themes.
  - `deputados`, `partidos` → **PublicAgent** / **Party** sync.
- **Senado Federal — Dados Abertos** — `https://legis.senado.leg.br/dadosabertos` (XML by default;
  JSON via `.json` suffix or `Accept: application/json`). Relevant resources:
  - `materia` → **Theme** candidates.
  - `votacoes` and `senador/{codigo}/votacoes` → **public-agent Votes**.
  - `materia/atualizadas.json?numdias=N` → polling endpoint for what changed recently.
- Keep the source list **extensible** for other official bodies (state assemblies, municipal
  chambers, TSE, etc.) behind a common importer interface.

### Mapping to the data model

- Official bill/amendment → **Theme** (name + summary). Attached official documents/links →
  **Article** (original link + download link); each imported Article still passes through the **AI
  enrichment step** (§4) that incrementally updates the Theme summary.
- Official roll-call vote → **Vote** cast by a **PublicAgent** (yes / no / abstention), mapped to our
  `+1 / -1 / 0` model.
- Official legislators/parties → **PublicAgent** / **Party** records.

### Sync design (MVP → scalable)

- **Pull/polling** model: a scheduled job periodically queries each source's "recently updated"
  endpoint (e.g. Câmara by date range, Senado `materia/atualizadas`), then fetches details only for
  changed items. No source pushes to us.
- **Idempotent upserts:** store each source's native identifier as an internal `source` +
  `external_ref` pair and upsert on it, so re-runs never duplicate. (These are the government's IDs,
  used only internally for dedup — they are **not** exposed externally; our public identifiers remain
  `kid` / `tsuuid` per §5.)
- **Importer abstraction:** one importer per source behind a shared interface (fetch-updated →
  normalize → upsert), so new official bodies can be added without touching core logic.
- **Provenance & trust:** persist source, fetch timestamp, and raw payload reference for auditability;
  imported records are clearly attributable to their official origin.
- **Resilience:** rate-limit, retry with backoff, and tolerate source downtime without data loss
  (resume from last successful sync watermark).
- Start simple (a cron-style job hitting the APIs); evolve to a queue/worker pipeline as volume grows.

---

## 9. Design

- Clean, modern, conveying **robustness and security**.
- **Sober colors** associated with Brazil — navy blue or colonial green.
- Modern **sans-serif** fonts. Fully **responsive**.
- Governmental gravitas but **high-end design quality** — inspiration from banks, fintechs, and
  payment companies (most Brazilian public-sector products are poorly made; Votto must not be).

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

- Final naming scheme for the **Political Positioning Index** profiles.
- Exact similarity formula and theme weighting for the **Alignment Index**.
- Theme → positioning-dimension tagging model.
- Confirm gov.br / bank OIDC provider availability and onboarding requirements.
- Confirm hosting choice (Fly.io `gru` vs AWS `sa-east-1`).
- Confirm coverage / rate limits of the Câmara & Senado APIs and which state/municipal bodies expose
  open data (§8).
