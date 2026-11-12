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

function resolveDatabaseUrl(env) {
  if (env.DATABASE_URL && !env.DATABASE_URL.includes('${')) return env.DATABASE_URL;
  const user = (env.DB_USER || '').trim();
  const host = (env.DB_HOST || '').trim().replace(/^localhost$/, '127.0.0.1');
  const name = (env.DB_NAME || '').trim();
  if (!user || !host || !name) return null;
  return `mysql://${encodeURIComponent(user)}:${encodeURIComponent(env.DB_PASSWORD || '')}@${host}:${(env.DB_PORT || '3306').trim()}/${name}`;
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

module.exports = { prepareDatabase, resolveDatabaseUrl, generatedClientIsCurrent };
