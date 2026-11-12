/* eslint-disable @typescript-eslint/no-require-imports -- Script CommonJS executado antes do build. */
'use strict';

// Etapa "prebuild": gera o cliente Prisma (só se o schema mudou) e aplica as migrations
// com `prisma migrate deploy`. Nunca usa `db push`, `--accept-data-loss` nem reset.
// Faça o backup (deploy/backup-db.sh) ANTES de cada deploy em produção.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function generatedClientIsCurrent(projectDir) {
  try {
    const schema = fs.readFileSync(path.join(projectDir, 'prisma/schema.prisma'), 'utf8').trim();
    const generatedDir = path.join(projectDir, 'node_modules/.prisma/client');
    const generated = fs.readFileSync(path.join(generatedDir, 'schema.prisma'), 'utf8').trim();
    const version = require(path.join(projectDir, 'node_modules/@prisma/client/package.json')).version;
    const meta = JSON.parse(fs.readFileSync(path.join(generatedDir, 'package.json'), 'utf8'));
    return schema === generated && meta.version === version && fs.existsSync(path.join(generatedDir, 'index.js'));
  } catch { return false; }
}

/** Painéis de hospedagem costumam gravar o valor literalmente: remove espaços e aspas ao redor ("mysql://…" → mysql://…). */
function cleanEnvValue(v) {
  let s = String(v ?? '').trim();
  while (s.length >= 2 && ((s[0] === '"' && s.at(-1) === '"') || (s[0] === "'" && s.at(-1) === "'"))) s = s.slice(1, -1).trim();
  return s;
}

/** Mostra só o começo do valor (sem segredos) para diagnosticar URLs malformadas. */
function hint(v) {
  return JSON.stringify(v.slice(0, 8)) + (v.length > 8 ? '…' : '');
}

function resolveDatabaseUrl(env) {
  const direct = cleanEnvValue(env.DATABASE_URL);
  if (direct && !direct.includes('${')) {
    if (/^mysql:\/\//i.test(direct)) return direct;
    // URL inválida: usa DB_* se existir; senão falha com mensagem clara (não pula as migrations em silêncio).
    if (!(env.DB_USER && env.DB_HOST && env.DB_NAME)) {
      throw new Error(`DATABASE_URL inválida: deve começar com mysql:// (o valor começa com ${hint(direct)}). Sem aspas; senha com caracteres especiais precisa de percent-encoding. Alternativa: defina DB_HOST, DB_PORT, DB_NAME, DB_USER e DB_PASSWORD.`);
    }
  }
  const user = cleanEnvValue(env.DB_USER);
  const host = cleanEnvValue(env.DB_HOST).replace(/^localhost$/, '127.0.0.1');
  const name = cleanEnvValue(env.DB_NAME);
  if (!user || !host || !name) return null;
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(cleanEnvValue(env.DB_PASSWORD))}@${host}:${cleanEnvValue(env.DB_PORT) || '3306'}/${name}`;
}

function prepareDatabase({ env = process.env, projectDir = path.resolve(__dirname, '..'), run = execFileSync, logger = console } = {}) {
  const cli = path.join(projectDir, 'node_modules/prisma/build/index.js');
  const execute = (args, e = env) => run(process.execPath, [cli, ...args], { cwd: projectDir, env: e, stdio: 'inherit' });

  if (!generatedClientIsCurrent(projectDir)) {
    const started = Date.now();
    execute(['generate']);
    logger.log(`[build] Cliente Prisma gerado em ${Date.now() - started} ms.`);
  } else logger.log('[build] Cliente Prisma já atualizado; geração dispensada.');

  const url = resolveDatabaseUrl(env);
  if (!url) { logger.log('[build] Banco não configurado; migrations não aplicadas.'); return { migrated: false }; }
  const started = Date.now();
  execute(['migrate', 'deploy'], { ...env, DATABASE_URL: url });
  logger.log(`[build] Migrations aplicadas em ${Date.now() - started} ms.`);
  return { migrated: true };
}

if (require.main === module) {
  try { prepareDatabase(); }
  catch (error) { console.error('[build] Falha ao preparar o banco:', error.message); process.exit(1); }
}

module.exports = { prepareDatabase, resolveDatabaseUrl, generatedClientIsCurrent, cleanEnvValue };
