# Deploy — single cheap box (AWS, sa-east-1)

The whole stack (Next.js app + PostgreSQL + Redis) runs **on one instance** via
Docker Compose. Cheapest path for the MVP; easy to split into managed services
(RDS / ElastiCache / App Runner) later.

- **App:** Next.js 16 standalone container (`Dockerfile`)
- **DB:** PostgreSQL 16 container (persistent volume)
- **Cache:** Redis 7 container (optional — app works without it)
- **HTTPS:** Caddy (automatic TLS) — optional, needs a domain

Estimated cost: **~US$10–20/month** (one Lightsail/EC2 instance). No extra
managed-service fees.

> **Database rule:** migrations and seed are run by **you** (documented below),
> never automatically.

---

## 1. Create the instance (AWS Lightsail — simplest)

1. AWS Console → **Lightsail** → **Create instance**.
2. Region: **São Paulo (sa-east-1)**.
3. Blueprint: **OS Only → Ubuntu 24.04 LTS**.
4. Plan: at least **2 GB RAM** (`next build` needs memory). 4 GB is comfortable.
5. Create. Then **Networking → IPv4 firewall**, open ports **80** and **443**
   (and **3000** temporarily if you'll test before setting up a domain).
6. Attach a **static IP** (Networking → Create static IP). Note this IP.

### Point votto.online (Namecheap) at the box

In Namecheap → Domain List → **Manage** votto.online → **Advanced DNS**, add:

| Type    | Host | Value                      |
| ------- | ---- | -------------------------- |
| A       | `@`  | `<your Lightsail static IP>` |
| CNAME   | `www`| `votto.online.`            |

Remove any default "URL Redirect"/parking records on `@`. DNS can take a few
minutes to propagate; Caddy then issues TLS automatically for the domain.

> EC2 equivalent: a `t4g.small` in sa-east-1 with a security group opening 80/443.

## 2. Install Docker

SSH into the box, then:

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

On a 2 GB box, add swap so the image build doesn't run out of memory:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. Get the code & configure secrets

```bash
git clone -b feature/project-bootstrap \
  https://github.com/thiago-prado-cavalcanti/votto.git votto && cd votto
cp .env.example .env.production
```

> Private repo: when prompted, use a GitHub Personal Access Token as the password
> (or set up a deploy key / `gh auth login` on the box).

Generate strong secrets and put them in `.env.production`:

```bash
openssl rand -base64 48   # AUTH_SECRET and CPF_HMAC_KEY
openssl rand -base64 32   # CPF_ENC_KEY  (must decode to exactly 32 bytes)
openssl rand -base64 24   # POSTGRES_PASSWORD
```

Set at minimum in `.env.production`:
`AUTH_SECRET`, `CPF_ENC_KEY`, `CPF_HMAC_KEY`, `POSTGRES_PASSWORD`,
`APP_URL` (e.g. `https://votto.online`), `DOMAIN` (e.g. `votto.online`),
`GOVBR_REDIRECT_URI` (`https://votto.online/api/auth/govbr/callback`).
Optional: `ANTHROPIC_API_KEY` (AI summary), real `GOVBR_*` for production login.

> **Google Analytics** is *not* set here. `GA_MEASUREMENT_ID` is declared in
> `docker-compose.prod.yml` (a measurement id is public — it ships in the HTML),
> so changing or disabling analytics is a commit + push. Only the public site is
> measured; admin, `/embed` widgets and `/dev-idp` never load the tag.

> `DATABASE_URL` / `REDIS_URL` are set automatically by compose to the bundled
> services — you don't edit them for production.

> ⚠️ Never change `CPF_ENC_KEY` after data exists — encrypted CPFs become
> unrecoverable. Keep a secure backup of it.

## 4. Build & start

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

## 5. Apply the database schema + seed (you run this)

```bash
# schema (Prisma migrations)
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate

# administrator only — the sync worker supplies all the real data
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate npm run db:seed:admin
```

Seed prints the admin login (`admin@votto.gov.br` / `Votto@2026` — change it).

> **Do not run the plain `npm run db:seed` in production.** Its demo mode writes a
> synthetic roster with `source: MANUAL`, while the importers write the same
> people with `source: CAMARA`/`SENADO` — every deputy would appear twice. If a
> demo seed already ran on this box, clean it up with
> `npm run db:seed:purge-demo` (removes only `seed:*` rows, leaving imported and
> hand-edited records intact).

> **Order matters:** always run `migrate` (and rebuild) BEFORE the new web image
> serves traffic, so the schema and code stay in sync. The auto-deploy workflow
> (`.github/workflows/deploy.yml`) does this for you: `git reset --hard` → build
> → `migrate` → `up`.

> **Troubleshooting — `migrate` reports fewer migrations than the repo has
> (e.g. "2 migrations found" when `prisma/migrations/` holds four):** the
> `migrate` image is stale. It sits behind the `tools` profile, and a bare
> `docker compose build` **skips services in inactive profiles** — so the
> migrate image is never rebuilt and migrations run from old source. Name the
> service explicitly:
> ```bash
> docker compose --env-file .env.production -f docker-compose.prod.yml build migrate
> ```
> The deploy workflow now builds `web worker migrate` by name for this reason.

> **Troubleshooting — `column ... does not exist` (P2022) but `migrate` says
> "No pending migrations":** the migration is recorded as applied but its SQL
> never ran (usually after building from a stale/cached image). Apply the missing
> change manually, e.g.:
> ```bash
> docker compose --env-file .env.production -f docker-compose.prod.yml exec -T db \
>   psql -U votto -d votto <<'SQL'
> ALTER TABLE "Theme"
>   ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '',
>   ADD COLUMN IF NOT EXISTS "viewpoints" JSONB;
> SQL
> ```
> Then re-run the seed to populate content. Forcing `docker compose build
> --no-cache` before `migrate` also prevents stale-image migrations.

## 5b. Start the synchronization worker

The `worker` service keeps the federal data current (deputies, senators, parties,
bills and roll-call votes). It is part of the default compose stack, so `up -d`
already started it — confirm and watch its first catch-up run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps worker
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f worker
```

On a fresh box it imports everything immediately (no job has a recent successful
run), which takes roughly 30–60 minutes end to end. After that it only wakes on
the Sunday early-morning slots. Full details in [integracao.md](integracao.md).

## 6. HTTPS with your domain (recommended)

With `DOMAIN` set and DNS pointing to the box, bring up Caddy and stop exposing
3000 directly:

```bash
# remove the "3000:3000" ports mapping from the web service first (optional),
docker compose --env-file .env.production -f docker-compose.prod.yml --profile proxy up -d
```

Caddy obtains and renews TLS automatically. The app is now at `https://<DOMAIN>`.
Without a domain, access it at `http://<static-ip>:3000`.

---

## Operations

**Update to a new version**
```bash
git pull
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm migrate   # if schema changed
```

**Database backup (do this regularly)**
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec db \
  pg_dump -U votto votto | gzip > votto-$(date +%F).sql.gz
```
Copy the dump off the box (e.g. to S3). For a managed alternative later, restore
this dump into **RDS** and point `DATABASE_URL` there.

**Official data (Câmara/Senado)** — handled by the `worker` container, which runs
every job on its weekly slot and catches up on boot. See
[integracao.md](integracao.md) for the job list, manual runs and troubleshooting.

```bash
# force a single job now (see integracao.md for the full list)
docker compose --env-file .env.production -f docker-compose.prod.yml \
  run --rm migrate npm run sync camara:votes
```

**Logs**
```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f web
docker compose --env-file .env.production -f docker-compose.prod.yml logs -f worker
```

---

## When to graduate to managed services

This single box is great for the MVP. Move to managed pieces when you need HA,
backups-by-default, or to scale:

1. **DB → Amazon RDS for PostgreSQL** (sa-east-1). Restore the `pg_dump`, set
   `DATABASE_URL` to the RDS endpoint, drop the `db` service.
2. **Cache → ElastiCache for Redis**. Set `REDIS_URL`, drop the `redis` service.
3. **App → AWS App Runner** (or ECS Fargate) from the same `Dockerfile` (push to
   ECR). Gives auto-scaling + managed HTTPS; retire Caddy.

Because the app reads everything from env vars, each step is just changing a URL.

---

## Production notes

- **gov.br login:** the dev mock (`GOVBR_MODE=mock`) must NOT be used in
  production. Register the app with gov.br, set `GOVBR_MODE=real` and the real
  `GOVBR_CLIENT_ID/SECRET/ISSUER/REDIRECT_URI`. The callback route refuses the
  mock form submission whenever the mode is not `mock`, so a half-finished
  switch fails closed. Onboarding steps: [integracao.md](integracao.md#govbr).
- **Source contract check:** run `npm run check:sources` after a deploy. It hits
  the Câmara/Senado/gov.br endpoints and fails loudly if a payload shape changed
  — neither house versions its open data. It touches no database.
- **Admin password:** change the seeded admin password immediately.
- **Secrets:** keep `.env.production` off git (already gitignored) and back up
  `CPF_ENC_KEY` securely (e.g. AWS Secrets Manager).
