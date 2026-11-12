# Deploy

Dois processos: **web** (Next.js, Hostinger) e **worker** (coleta, alertas, geocodificação). O web nunca depende do worker para responder.

## 1. Web na Hostinger (preset Next.js)
Mesmo fluxo do `house-flipping-app`:
- Raiz do projeto = `regnus-leiloes`; comando de build `npm run build`; start `npm start` (= `node server.js`, que abre a porta antes de preparar o Next).
- `.npmrc` mantém `include=dev` (TypeScript/Prisma no build). Em deploy por ZIP, exclua `node_modules`, `.next` e `.git`.
- **Variáveis** (painel da Hostinger): `DATABASE_URL` (ou `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`), `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL=https://seu-dominio`, `SMTP_*`, `CRAWLER_USER_AGENT`. Veja `.env.example`.
- O `prebuild` (`scratch/prepare-db.js`) gera o cliente Prisma e roda **`prisma migrate deploy`**. Nunca `db push --accept-data-loss` nem reset. Falha de migration interrompe o build.
- Primeiro deploy: depois do build, rode uma vez o seed (`npm run db:seed` num terminal SSH/console) e **guarde a senha do admin** (exibida uma única vez).
- Mudou o schema? Gere uma migration nova (`npx prisma migrate dev --name x` localmente), revise o SQL e commite `prisma/migrations/`. Para conferir que as migrations reproduzem o schema: aplique-as num banco vazio (`prisma migrate deploy`) e rode `npm run db:drift` — deve sair com código 0 (compara o banco real com `schema.prisma`; a comparação via shadow database acusa um falso positivo no índice FULLTEXT do Prisma 5).

## 2. Banco (MySQL 8)
- Hostinger MySQL (ou outro). **Backup diário verificado**: `deploy/backup-db.sh` (mysqldump + gzip + checagem de tabelas, retenção 14 dias) via cron. Rode também **antes de cada deploy**.
- Teste a restauração periodicamente em um banco de homologação (`zcat backup.sql.gz | mysql ...`).
- Índices FULLTEXT já estão na migration. Busca por raio (opcional): `prisma/manual/001_property_point.sql`.

## 3. Worker — dois modos
**A) Recomendado: processo contínuo num VPS** (Hostinger VPS ou similar; obrigatório se algum conector usar Playwright/Chromium — hoje nenhum usa).
```bash
git clone … && cd regnus-leiloes && npm ci && npx prisma generate
cp .env.example .env   # DATABASE_URL, SMTP_*, NEXTAUTH_URL, GEOCODE=1 se quiser geocodificar
npm i -g pm2 && pm2 start ecosystem.config.cjs && pm2 save && pm2 startup
```
Alternativas: `docker build -t regnus . && docker run -d --env-file .env --restart=always regnus npm run worker`, ou unit systemd com `ExecStart=/usr/bin/npm run worker`.
O worker: agenda `FULL_SYNC` das fontes ativas vencidas (`Source.intervalMinutes`), consome a fila (lease de 5 min, retry exponencial), envia alertas após cada coleta e (com `GEOCODE=1`) geocodifica em lotes.

**B) Fallback sem VPS: cron + `worker:tick`**
`npm run worker:tick -- --max-minutes 10` termina sozinho. Dispare pelo cron da Hostinger ou use `.github/workflows/crawl-tick.yml` (exige MySQL acessível pelo GitHub e segredos configurados). Não serve para conectores com browser. Coletas longas (Caixa completa, ~4 min; Frazão/Biasi com detalhe, ~7 min cada) cabem em 10 min **uma por vez** — a fila continua na próxima execução.

## 4. Verificações pós-deploy
1. `GET /api/health` → `{"ok":true,"db":"up",…}` (503 se o banco cair). Configure um monitor externo (UptimeRobot etc.) neste endpoint; `ageMinutes` alto = worker parado.
2. Login com o admin do seed; **Admin → Fontes**: ative `caixa` e clique "Rodar agora"; acompanhe em **Execuções**.
3. `/busca` com filtros, mapa, detalhe com link da fonte; favoritar; criar busca salva e receber e-mail (SMTP real ou Mailpit).
4. `curl -I https://seu-dominio/login` mostra CSP/HSTS/nosniff.

## 5. Rollback
- Código: redeploy do commit anterior (as migrations são aditivas; não faça downgrade de schema sem restaurar backup).
- Dados: restaure o backup tirado antes do deploy. Pause o worker (`pm2 stop regnus-worker`) durante a restauração.
- Fonte quebrada: desative-a em Admin → Fontes (o alerta de queda de volume > 50 % aponta parser quebrado). Dados antigos permanecem; anúncios só são fechados após 2 coletas completas sem o item.

## 6. Segurança operacional
Segredos só em variáveis de ambiente/`.env` (nunca no Git). Troque a senha do admin após o primeiro login. Limite de login (5 falhas → 15 min) e API (60/min por chave) são **em memória** — para múltiplas instâncias do web, mova para Redis/DB.
