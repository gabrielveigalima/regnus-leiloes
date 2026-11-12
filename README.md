# Regnus Leilões

Agregador de imóveis em leilão no Brasil (Grupo Regnus). Ferramenta interna agora, pronta para SaaS (multi-tenant, planos, API).
Next.js 16 + Prisma 5 + MySQL 8 · crawlers próprios em Node · deploy na Hostinger (web) + VPS (worker).

## Início rápido (desenvolvimento)
```bash
docker compose up -d                # MySQL 8.4 + Mailpit (SMTP de teste em :1025, UI em :8025)
cp .env.example .env                # ajuste DATABASE_URL e NEXTAUTH_SECRET
npm ci
npx prisma migrate deploy           # aplica as migrations
npm run db:seed                     # cria org "Regnus", planos, 15 fontes (desativadas) e o admin — anote a senha exibida
npm run crawl -- --source caixa --uf SP --limit 50 --dry-run   # testa um conector sem gravar
npm run crawl -- --source caixa --uf SP                         # grava
npm run dev                         # http://localhost:3000
```
Ative as fontes em **Admin → Fontes** (ou `UPDATE Source SET active = 1 WHERE id = 'caixa'`). O worker (`npm run worker`) agenda e executa as coletas.

## Scripts
| Comando | O que faz |
|---|---|
| `npm run dev` / `build` / `start` | Next.js (build com webpack; `start` = `server.js`) |
| `npm run crawl -- --source <id> [--uf SP] [--limit N] [--dry-run]` | roda um conector |
| `npm run worker` | loop contínuo: agenda fontes vencidas, consome a fila, envia alertas, geocodifica (`GEOCODE=1`) |
| `npm run worker:tick -- --max-minutes 10` | igual, mas termina sozinho (cron) |
| `npm run geocode -- --limit 50` | geocodifica imóveis sem coordenadas |
| `npm run db:migrate` / `db:seed` / `db:drift` | migrations, seed, checagem de drift |
| `npm run typecheck` · `lint` · `test` · `test:build` | verificações (veja abaixo) |

## Testes
`npm test` roda tudo sem rede. Os testes que precisam de MySQL real (fila, isolamento multi-tenant, alertas, dedup, API) são **pulados** sem `TEST_DATABASE_URL`:
```bash
TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3306/regnus_test" npx prisma migrate deploy   # com DATABASE_URL apontando para o mesmo banco
TEST_DATABASE_URL="mysql://root:root@127.0.0.1:3306/regnus_test" npm test
```

## Documentação
- [docs/architecture.md](docs/architecture.md) — como o sistema funciona
- [docs/deploy.md](docs/deploy.md) — Hostinger, worker, backup, rollback
- [docs/sources.md](docs/sources.md) — status de cada fonte
- [docs/compliance.md](docs/compliance.md) — termos de uso, LGPD, o que revisar antes de comercializar
- [docs/api.md](docs/api.md) — API pública v1 (OpenAPI)
- Cada conector tem `src/crawler/connectors/<id>/README.md`.
