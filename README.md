# Votto

Plataforma de **voto popular direto** e medição de **alinhamento político** entre cidadãos e
agentes públicos — um complemento à democracia representativa. Consulte [CLAUDE.md](CLAUDE.md) para
a visão completa, modelo de dados e convenções.

## Stack

- **Next.js 16** (App Router) + **TypeScript** — SSR, React Server Components e Server Actions.
- **PostgreSQL** + **Prisma** (ORM).
- **Redis** (cache do índice de alinhamento; opcional — degrada graciosamente).
- **Tailwind CSS v4** — design system navy + verde colonial.
- **Anthropic Claude** — enriquecimento de resumo de temas (opcional, via env).
- Auth: cidadão via **login social** (Apple, Google, Meta) + confirmação de CPF
  no registro oficial (mock em dev); admin via email + senha.

## Pré-requisitos

- Node 20+, npm
- Docker (para Postgres + Redis locais) — ou um Postgres acessível

## Setup

```bash
# 1) Dependências
npm install

# 2) Variáveis de ambiente
cp .env.example .env
# Gere segredos reais e cole no .env:
openssl rand -base64 48   # -> AUTH_SECRET e CPF_HMAC_KEY
openssl rand -base64 32   # -> CPF_ENC_KEY  (precisa ter exatamente 32 bytes)

# 3) Infra local (Postgres + Redis)
docker compose up -d

# 4) Banco: schema + dados
npm run db:migrate        # cria/aplica o schema (Prisma migrate dev)
npm run db:seed           # dados de demonstração (só desenvolvimento)

# 5) App
npm run dev               # http://localhost:3100
```

> **Migration manual:** se preferir não usar `prisma migrate`, o SQL completo do schema está em
> [`docs/migrations/0001_init.sql`](docs/migrations/0001_init.sql) para execução manual.

## Acessos

- **Site público:** http://localhost:3100
- **Backend admin:** http://localhost:3100/admin
  - Login (do seed): `admin@votto.gov.br` / `Votto@2026`
- **Login de cidadão (Apple / Google / Meta):** duas etapas — o provedor social
  autentica a conta, e o CPF é confirmado no registro oficial (`/entrar/cpf`).
  Em produção, OIDC real (`SOCIAL_MODE=real` + credenciais de cada provedor).
  Em desenvolvimento, clique em *Entrar* e escolha qualquer provedor: o
  simulador em `/dev-idp` devolve uma conta de teste, e o provedor `mock` de CPF
  aceita qualquer CPF estruturalmente válido.

## Dados oficiais (Câmara / Senado)

Deputados, senadores, partidos, proposições em pauta e votos nominais vêm das APIs públicas de
Dados Abertos (sem autenticação), por dez jobs independentes que rodam **semanalmente** no
container `worker`. Os registros são deduplicados por `(source, externalRef)`, então reexecutar
nunca duplica.

```bash
npm run backfill -- --top 100           # carga inicial: 6 meses, 100 proposições por casa
npm run sync all                        # refresh federal completo
npm run sync camara:votes -- --days 90  # reimporta três meses de votações
npm run check:sources                   # confere os contratos das APIs (não toca no banco)
```

Painel operacional em `/admin/sincronizacao`. Detalhes — jobs, urgência/classificação,
gatilho HTTP e onboarding dos provedores sociais — em [`docs/integracao.md`](docs/integracao.md).

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (`prisma generate` + `next build`) |
| `npm run start` | Servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Aplica o schema (Prisma migrate dev) |
| `npm run db:seed` | Dados de demonstração (só desenvolvimento) |
| `npm run db:seed:admin` | Só o administrador — use em produção |
| `npm run db:seed:purge-demo` | Remove os dados de demonstração |
| `npm run backfill` | Carga histórica das fontes oficiais |
| `npm run reprioritize` | Recalcula a prioridade dos temas (sem rede) |
| `npm run sync <job\|all>` | Sincroniza uma fonte oficial agora |
| `npm run worker` | Agendador semanal das sincronizações |
| `npm run check:sources` | Verifica os contratos das APIs oficiais |

## Segurança & privacidade

- O cidadão só faz login por provedores oficiais que já validam CPF; **não há cadastro**.
- Em claro guardamos apenas **nome e sobrenome**. O CPF é **criptografado** (AES-256-GCM), com um
  **HMAC** determinístico para garantir *um voto por CPF por tema* sem comparar CPF em texto puro, e
  um **prefixo de 6 dígitos** para usos de baixa sensibilidade.
- IDs internos **nunca** saem do sistema; recursos são referenciados por `kid` (ver `src/lib/dto.ts`).

## Estrutura

```
src/
  app/(public)/      # site público (home, login, agentes, temas, voto)
  app/(admin)/admin/ # backend (login, dashboard, CRUDs)
  app/api/auth/      # login social (OIDC real + mock) + admin
  app/api/cron/      # gatilho HTTP das sincronizações (CRON_SECRET)
  app/dev-idp/       # provedor social simulado (dev)
  lib/               # db, redis, auth, crypto/cpf, indexes, ai, integration, dto
  components/         # ui (design system), public, admin
prisma/              # schema.prisma, seed.ts
scripts/             # sync.ts (CLI), worker.ts (agendador), check-sources.ts
docs/design.md       # design system ("papel & pigmento"): tokens, tipografia, padrões
docs/integracao.md   # integração com as fontes oficiais + login social e CPF
docs/login-social-passo-a-passo.md  # cadastro no Google/Meta/Apple, clique a clique
docs/migrations/     # SQL do schema (execução manual)
```
