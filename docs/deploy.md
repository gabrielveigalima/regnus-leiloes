# Deploy

Dois processos: **web** (Next.js, Hostinger) e **worker** (coleta, alertas, geocodificação). O web nunca depende do worker para responder.

## 1. Web na Hostinger (preset Next.js)
Mesmo fluxo do `house-flipping-app`:
- Raiz do projeto = `regnus-leiloes`; comando de build `npm run build`; start `npm start` (= `node server.js`, que abre a porta antes de preparar o Next).
- `.npmrc` mantém `include=dev` (TypeScript/Prisma no build). Em deploy por ZIP, exclua `node_modules`, `.next` e `.git`.
- **Variáveis** (painel da Hostinger): `DATABASE_URL` **sem aspas** e começando com `mysql://` (senha com caracteres especiais em percent-encoding; o build remove aspas/espaços ao redor, mas falha com erro claro se não for `mysql://`) — ou `DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`, `NEXTAUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL=https://seu-dominio`, `SMTP_*`, `CRAWLER_USER_AGENT`. Veja `.env.example`.
- O `prebuild` (`scratch/prepare-db.js`) gera o cliente Prisma e roda **`prisma migrate deploy`**. Nunca `db push --accept-data-loss` nem reset. Falha de migration interrompe o build.
- Primeiro deploy: depois do build, rode uma vez o seed (`npm run db:seed` num terminal SSH/console) e **guarde a senha do admin** (exibida uma única vez).
- Mudou o schema? Gere uma migration nova (`npx prisma migrate dev --name x` localmente), revise o SQL e commite `prisma/migrations/`. Para conferir que as migrations reproduzem o schema: aplique-as num banco vazio (`prisma migrate deploy`) e rode `npm run db:drift` — deve sair com código 0 (compara o banco real com `schema.prisma`; a comparação via shadow database acusa um falso positivo no índice FULLTEXT do Prisma 5).

### Banco na Hostinger (hPanel)
1. hPanel → **Bancos de dados → MySQL**: crie o banco e o usuário (anote nome, usuário e senha; o host costuma ser `localhost`).
2. Na aplicação, em **Variáveis de ambiente**, defina **ou** `DATABASE_URL=mysql://USUARIO:SENHA@127.0.0.1:3306/NOME_DO_BANCO` **ou** `DB_HOST=localhost`, `DB_PORT=3306`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` (sem aspas; senha com `@ : / # ?` etc. precisa de percent-encoding na `DATABASE_URL`, o que `DB_PASSWORD` dispensa).
3. Se o build falhar com "DATABASE_URL inválida", a mensagem mostra com o que o valor começa — confira o painel.
4. `npm install` usa o `overrides` do `package.json` para o conflito de peer `next-auth` × `nodemailer`; não é preciso `--legacy-peer-deps`.

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

**B) Sem VPS: worker embutido no próprio site (Hostinger)**
Defina `ENABLE_WORKER=1` nas variáveis da aplicação e faça um novo deploy/reinício. O `src/instrumentation.ts` inicia o worker dentro do processo do Next (20 s depois de subir; `WORKER_START_DELAY_MS`), que agenda as fontes **ativas**, executa a fila, envia alertas (se houver SMTP) e reinicia sozinho se cair. Acompanhe em **Admin → Fontes** ("Worker embutido: ativo") e em `/api/health` (`embeddedWorker`).
- Limitações: compartilha CPU/memória do plano web; se a hospedagem reiniciar ou suspender o processo, a coleta retoma no próximo início (a fila tem lease). Conectores com Playwright não funcionam aqui (nenhum usa hoje). Mantenha `GEOCODE=0` (ou `1` só se quiser geocodificar no mesmo processo).
- Vários processos ao mesmo tempo são seguros.
- Fluxo para encher a produção: ative as fontes em Admin → Fontes (`megaleiloes` ≈ 1 min, `caixa` ≈ 4–10 min, `frazao` e `biasi` ≈ 7 min cada, por causa da página de cada lote); a primeira coleta começa em até 15 s depois de ativar (ou use "Rodar agora").

**C) Fallback: cron + `worker:tick`**
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
