import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../src/lib/prisma";

const SOURCES = [
  ["caixa", "Caixa Econômica Federal", "BANK", "https://venda-imoveis.caixa.gov.br"],
  ["bb", "Banco do Brasil", "BANK", "https://www.bb.com.br"],
  ["santander", "Santander", "BANK", "https://www.santander.com.br"],
  ["itau", "Itaú", "BANK", "https://www.itau.com.br"],
  ["bradesco", "Bradesco", "BANK", "https://www.bradesco.com.br"],
  ["zuk", "Portal Zuk (Zukerman)", "AUCTIONEER", "https://www.portalzuk.com.br"],
  ["megaleiloes", "Mega Leilões", "AUCTIONEER", "https://www.megaleiloes.com.br"],
  ["sodresantoro", "Sodré Santoro", "AUCTIONEER", "https://www.sodresantoro.com.br"],
  ["frazao", "Frazão Leilões", "AUCTIONEER", "https://www.frazaoleiloes.com.br"],
  ["biasi", "Biasi Leilões", "AUCTIONEER", "https://www.biasileiloes.com.br"],
  ["lancejudicial", "Lance Judicial", "AUCTIONEER", "https://www.lancejudicial.com.br"],
  ["superbid", "Superbid / Sold", "AUCTIONEER", "https://www.superbid.net"],
  ["freitas", "Freitas Leiloeiro", "AUCTIONEER", "https://www.freitasleiloeiro.com.br"],
  ["leje", "Leje", "AUCTIONEER", "https://www.leje.com.br"],
  ["pestana", "Pestana Leilões", "AUCTIONEER", "https://www.pestanaleiloes.com.br"],
  ["vendasgov", "VendasGov — Imóveis da União", "GOVERNMENT", "https://imoveis.vendasgov.serpro.gov.br"],
] as const;

async function main() {
  await prisma.plan.upsert({ where: { id: "INTERNO" }, update: {}, create: { id: "INTERNO", name: "Interno (ilimitado)", apiAccess: true, csvExport: true } });
  await prisma.plan.upsert({ where: { id: "BASICO" }, update: {}, create: { id: "BASICO", name: "Básico", maxUsers: 3, maxSavedSearches: 5, allowedUfs: ["SP"], csvExport: false } });
  await prisma.plan.upsert({ where: { id: "PRO" }, update: {}, create: { id: "PRO", name: "Pro", maxUsers: 20, maxSavedSearches: 50, apiAccess: true, csvExport: true } });

  const org = await prisma.organization.upsert({ where: { slug: "regnus" }, update: {}, create: { name: "Regnus", slug: "regnus", planId: "INTERNO" } });

  const email = process.env.ADMIN_EMAIL ?? "admin@regnus.local";
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    const password = randomBytes(12).toString("base64url");
    const user = await prisma.user.create({ data: { email, name: "Admin", passwordHash: await bcrypt.hash(password, 12), isPlatformAdmin: true, passwordSetAt: new Date() } });
    await prisma.membership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
    console.log(`\nAdmin criado: ${email}\nSenha (exibida uma única vez): ${password}\n`);
  }

  for (const [id, name, type, baseUrl] of SOURCES) {
    await prisma.source.upsert({ where: { id }, update: {}, create: { id, name, type, baseUrl, active: false, ...(id === "vendasgov" ? { intervalMinutes: 1440 } : {}) } });
  }
}
main().finally(() => prisma.$disconnect());
