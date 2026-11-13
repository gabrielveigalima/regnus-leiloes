#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- Script CommonJS de linha de comando. */
'use strict';

// Gera o SQL para criar (ou redefinir a senha d)o administrador direto no phpMyAdmin, sem rodar o seed.
// Uso:  node deploy/make-admin-sql.js 'SuaSenhaForte123' [email]  > admin.sql
// Depois: phpMyAdmin → banco do projeto → aba SQL → cole o conteúdo de admin.sql → Executar.
// A senha vira um hash bcrypt (custo 12, o mesmo do login); o SQL não contém a senha em texto.
// Pode rodar de novo: se o usuário já existe, apenas redefine a senha.
const bcrypt = require('bcrypt');

const [password, emailArg] = process.argv.slice(2);
const email = (emailArg || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
if (!password || !email) {
  console.error("Uso: node deploy/make-admin-sql.js 'SENHA' [email]   (ou defina ADMIN_EMAIL)");
  process.exit(1);
}
if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
  console.error('A senha deve ter pelo menos 10 caracteres, com letras e números.');
  process.exit(1);
}
if (!/^[^\s@']+@[^\s@']+\.[^\s@']{2,}$/.test(email)) {
  console.error('E-mail inválido.');
  process.exit(1);
}

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
const hash = bcrypt.hashSync(password, 12);

const SOURCES = [
  ['caixa', 'Caixa Econômica Federal', 'BANK', 'https://venda-imoveis.caixa.gov.br'],
  ['bb', 'Banco do Brasil', 'BANK', 'https://www.bb.com.br'],
  ['santander', 'Santander', 'BANK', 'https://www.santander.com.br'],
  ['itau', 'Itaú', 'BANK', 'https://www.itau.com.br'],
  ['bradesco', 'Bradesco', 'BANK', 'https://www.bradesco.com.br'],
  ['zuk', 'Portal Zuk (Zukerman)', 'AUCTIONEER', 'https://www.portalzuk.com.br'],
  ['megaleiloes', 'Mega Leilões', 'AUCTIONEER', 'https://www.megaleiloes.com.br'],
  ['sodresantoro', 'Sodré Santoro', 'AUCTIONEER', 'https://www.sodresantoro.com.br'],
  ['frazao', 'Frazão Leilões', 'AUCTIONEER', 'https://www.frazaoleiloes.com.br'],
  ['biasi', 'Biasi Leilões', 'AUCTIONEER', 'https://www.biasileiloes.com.br'],
  ['lancejudicial', 'Lance Judicial', 'AUCTIONEER', 'https://www.lancejudicial.com.br'],
  ['superbid', 'Superbid / Sold', 'AUCTIONEER', 'https://www.superbid.net'],
  ['freitas', 'Freitas Leiloeiro', 'AUCTIONEER', 'https://www.freitasleiloeiro.com.br'],
  ['leje', 'Leje', 'AUCTIONEER', 'https://www.leje.com.br'],
  ['pestana', 'Pestana Leilões', 'AUCTIONEER', 'https://www.pestanaleiloes.com.br'],
  ['vendasgov', 'VendasGov — Imóveis da União', 'GOVERNMENT', 'https://imoveis.vendasgov.serpro.gov.br'],
];

const sql = `-- Regnus Leilões: administrador inicial (gerado por deploy/make-admin-sql.js)
START TRANSACTION;

INSERT INTO \`Plan\` (\`id\`, \`name\`, \`maxUsers\`, \`maxSavedSearches\`, \`allowedUfs\`, \`apiAccess\`, \`csvExport\`) VALUES
  ('INTERNO', 'Interno (ilimitado)', NULL, NULL, NULL, 1, 1),
  ('BASICO', 'Básico', 3, 5, '["SP"]', 0, 0),
  ('PRO', 'Pro', 20, 50, NULL, 1, 1)
ON DUPLICATE KEY UPDATE \`id\` = \`id\`;

INSERT INTO \`Organization\` (\`id\`, \`name\`, \`slug\`, \`planId\`) VALUES ('org_regnus', 'Regnus', 'regnus', 'INTERNO')
ON DUPLICATE KEY UPDATE \`id\` = \`id\`;

INSERT INTO \`User\` (\`id\`, \`email\`, \`name\`, \`passwordHash\`, \`isPlatformAdmin\`, \`passwordSetAt\`) VALUES
  ('usr_admin', ${q(email)}, 'Admin', ${q(hash)}, 1, NOW(3))
ON DUPLICATE KEY UPDATE \`passwordHash\` = VALUES(\`passwordHash\`), \`isPlatformAdmin\` = 1, \`passwordSetAt\` = NOW(3);

INSERT IGNORE INTO \`Membership\` (\`id\`, \`organizationId\`, \`userId\`, \`role\`)
  SELECT 'mem_admin', o.\`id\`, u.\`id\`, 'OWNER' FROM \`Organization\` o, \`User\` u WHERE o.\`slug\` = 'regnus' AND u.\`email\` = ${q(email)};

INSERT IGNORE INTO \`Source\` (\`id\`, \`name\`, \`type\`, \`baseUrl\`, \`active\`) VALUES
${SOURCES.map(([id, name, type, url]) => `  (${q(id)}, ${q(name)}, ${q(type)}, ${q(url)}, 0)`).join(',\n')};

COMMIT;
`;
process.stdout.write(sql);
