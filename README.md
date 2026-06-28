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
- Auth: cidadão via **gov.br** (mock em dev); admin via email + senha.

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
npm run db:seed           # popula dados sintéticos determinísticos

# 5) App
npm run dev               # http://localhost:3000
```

> **Migration manual:** se preferir não usar `prisma migrate`, o SQL completo do schema está em
> [`docs/migrations/0001_init.sql`](docs/migrations/0001_init.sql) para execução manual.

## Acessos

- **Site público:** http://localhost:3000
- **Backend admin:** http://localhost:3000/admin
  - Login (do seed): `admin@votto.gov.br` / `Votto@2026`
- **Login de cidadão (mock gov.br):** clique em *Entrar* → *Entrar com gov.br*. No ambiente de
  simulação (`/dev-idp`) escolha uma identidade de teste ou informe nome + um CPF válido.

## Importação de dados oficiais (Câmara / Senado)

Importadores idempotentes a partir das APIs públicas de Dados Abertos (sem autenticação):

```bash
npm run import:camara     # tsx scripts/import.ts camara --days 30
npm run import:senado     # tsx scripts/import.ts senado --days 60
```

Os registros são deduplicados por `(source, externalRef)`, então rodar de novo não duplica.

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (`prisma generate` + `next build`) |
| `npm run start` | Servidor de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Aplica o schema (Prisma migrate dev) |
| `npm run db:seed` | Popula dados sintéticos |
| `npm run import:camara` / `:senado` | Importa dados oficiais |

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
  app/api/auth/      # gov.br (mock) + admin
  app/dev-idp/       # provedor gov.br simulado (dev)
  lib/               # db, redis, auth, crypto/cpf, indexes, ai, integration, dto
  components/         # ui (design system), public, admin
prisma/              # schema.prisma, seed.ts
scripts/import.ts    # CLI de importação
docs/migrations/     # SQL do schema (execução manual)
```
