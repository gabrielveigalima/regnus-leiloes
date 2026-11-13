import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;

test("alertas: novos e quedas casam com a busca, avançam lastRunAt, sem reenvio; limite do plano", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../src/lib/prisma");
  const { runAlerts } = await import("../src/lib/alerts");
  const { canCreateSavedSearch } = await import("../src/lib/access");
  const { tenantDb } = await import("../src/lib/tenancy");
  const sfx = Date.now().toString(36);
  await prisma.plan.upsert({ where: { id: "AL" }, update: { maxSavedSearches: 1 }, create: { id: "AL", name: "AL", maxSavedSearches: 1 } });
  const city = `AlertCity${Date.now().toString(36)}`; // cidade própria: o banco de teste pode conter dados reais
  const org = await prisma.organization.create({ data: { name: "al", slug: `al-${sfx}`, planId: "AL" } });
  const user = await prisma.user.create({ data: { email: `al-${sfx}@t.com`, passwordHash: "x" } });
  await prisma.source.upsert({ where: { id: "altest" }, update: {}, create: { id: "altest", name: "AlTest", type: "BANK", baseUrl: "http://a" } });
  const t0 = new Date(Date.now() - 3600_000);
  const db = tenantDb(org.id, user.id).savedSearches;
  const mk = async (ext: string, uf: string, bid: number) => {
    const p = await prisma.property.create({ data: { uf, city, type: "HOUSE" } });
    return prisma.listing.create({ data: { sourceId: "altest", externalId: `${ext}-${sfx}`, propertyId: p.id, url: "https://a/" + ext, title: "Imóvel " + ext, minBid: bid, discountPct: 30, status: "OPEN" } });
  };
  const sent: { to: string; subject: string; text: string }[] = [];
  const mailer = { send: async (m: { to: string; subject: string; text: string; html: string }) => { sent.push(m); } };
  try {
    assert.deepEqual(await canCreateSavedSearch(org.id), { ok: true });
    const s = await db.create({ name: "SP", frequency: "IMMEDIATE", filters: { uf: "SP", cidade: city } });
    assert.equal((await canCreateSavedSearch(org.id)).ok, false); // limite 1 do plano
    await prisma.savedSearch.update({ where: { id: s.id }, data: { createdAt: t0, lastRunAt: t0 } });

    const novoSP = await mk("novo", "SP", 100000);
    await prisma.listingEvent.create({ data: { listingId: novoSP.id, kind: "CREATED" } });
    const novoRJ = await mk("rj", "RJ", 100000); // fora do filtro
    await prisma.listingEvent.create({ data: { listingId: novoRJ.id, kind: "CREATED" } });
    const queda = await mk("queda", "SP", 90000);
    await prisma.listingEvent.create({ data: { listingId: queda.id, kind: "PRICE_CHANGE", oldValue: "120000", newValue: "90000" } });
    const alta = await mk("alta", "SP", 130000); // aumento de preço não alerta
    await prisma.listingEvent.create({ data: { listingId: alta.id, kind: "PRICE_CHANGE", oldValue: "100000", newValue: "130000" } });

    const r1 = await runAlerts({ mailer, log: () => {} });
    assert.ok(r1.sent >= 1);
    const mine = sent.filter((m) => m.to === `al-${sfx}@t.com`);
    assert.equal(mine.length, 1);
    assert.match(mine[0]!.text, /Imóvel novo/);
    assert.match(mine[0]!.text, /Imóvel queda/);
    assert.ok(!/Imóvel rj/.test(mine[0]!.text));
    assert.ok(!/Imóvel alta/.test(mine[0]!.text));
    assert.equal(await prisma.alertDelivery.count({ where: { savedSearchId: s.id } }), 1);

    await runAlerts({ mailer, log: () => {} });
    assert.equal(sent.filter((m) => m.to === `al-${sfx}@t.com`).length, 1, "reenviou o mesmo alerta");

    // falha de envio não avança lastRunAt
    const n = await mk("novo2", "SP", 50000);
    await prisma.listingEvent.create({ data: { listingId: n.id, kind: "CREATED" } });
    const before = (await prisma.savedSearch.findUniqueOrThrow({ where: { id: s.id } })).lastRunAt;
    await runAlerts({ mailer: { send: async () => { throw new Error("smtp off"); } }, log: () => {} });
    assert.equal((await prisma.savedSearch.findUniqueOrThrow({ where: { id: s.id } })).lastRunAt?.getTime(), before?.getTime());
    await runAlerts({ mailer, log: () => {} });
    assert.equal(sent.filter((m) => m.to === `al-${sfx}@t.com`).length, 2);

    // isolamento: outro usuário não vê nem apaga a busca
    const other = tenantDb(org.id, "outro-usuario").savedSearches;
    assert.equal((await other.list()).length, 0);
    assert.equal((await other.remove(s.id)).count, 0);
  } finally {
    await prisma.savedSearch.deleteMany({ where: { organizationId: org.id } });
    await prisma.listing.deleteMany({ where: { sourceId: "altest" } });
    await prisma.property.deleteMany({ where: { city } });
    await prisma.source.delete({ where: { id: "altest" } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
