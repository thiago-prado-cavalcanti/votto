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
6. Attach a **static IP** (Networking → Create static IP) and point your domain's
   A record to it (if you have one).

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
git clone <your-repo-url> votto && cd votto
cp .env.example .env.production
```

Generate strong secrets and put them in `.env.production`:

```bash
openssl rand -base64 48   # AUTH_SECRET and CPF_HMAC_KEY
openssl rand -base64 32   # CPF_ENC_KEY  (must decode to exactly 32 bytes)
openssl rand -base64 24   # POSTGRES_PASSWORD
```

Set at minimum in `.env.production`:
`AUTH_SECRET`, `CPF_ENC_KEY`, `CPF_HMAC_KEY`, `POSTGRES_PASSWORD`,
`APP_URL` (e.g. `https://votto.com.br`), `DOMAIN` (e.g. `votto.com.br`),
`GOVBR_REDIRECT_URI` (`https://votto.com.br/api/auth/govbr/callback`).
Optional: `ANTHROPIC_API_KEY` (AI summary), real `GOVBR_*` for production login.

> `DATABASE_URL` / `REDIS_URL` are set automatically by compose to the bundled
> services — you don't edit them for production.

> ⚠️ Never change `CPF_ENC_KEY` after data exists — encrypted CPFs become
> unrecoverable. Keep a secure backup of it.

## 4. Build & start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## 5. Apply the database schema + seed (you run this)

```bash
# schema (Prisma migrations)
docker compose -f docker-compose.prod.yml run --rm migrate

# optional: synthetic data + real Câmara/Senado roster + admin user
docker compose -f docker-compose.prod.yml run --rm migrate npm run db:seed
```

Seed prints the admin login (`admin@votto.gov.br` / `Votto@2026` — change it).

## 6. HTTPS with your domain (recommended)

With `DOMAIN` set and DNS pointing to the box, bring up Caddy and stop exposing
3000 directly:

```bash
# remove the "3000:3000" ports mapping from the web service first (optional),
docker compose -f docker-compose.prod.yml --profile proxy up -d
```

Caddy obtains and renews TLS automatically. The app is now at `https://<DOMAIN>`.
Without a domain, access it at `http://<static-ip>:3000`.

---

## Operations

**Update to a new version**
```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml run --rm migrate   # if schema changed
```

**Database backup (do this regularly)**
```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U votto votto | gzip > votto-$(date +%F).sql.gz
```
Copy the dump off the box (e.g. to S3). For a managed alternative later, restore
this dump into **RDS** and point `DATABASE_URL` there.

**Import official data (Câmara/Senado)**
```bash
docker compose -f docker-compose.prod.yml run --rm migrate npm run import:camara
docker compose -f docker-compose.prod.yml run --rm migrate npm run import:senado
```

**Logs**
```bash
docker compose -f docker-compose.prod.yml logs -f web
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
  `GOVBR_CLIENT_ID/SECRET/ISSUER/REDIRECT_URI`.
- **Admin password:** change the seeded admin password immediately.
- **Secrets:** keep `.env.production` off git (already gitignored) and back up
  `CPF_ENC_KEY` securely (e.g. AWS Secrets Manager).
