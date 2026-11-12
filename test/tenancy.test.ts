import test from "node:test";
import assert from "node:assert/strict";

// Requer MySQL real (TEST_DATABASE_URL). Sem ele, o teste é pulado.
const url = process.env.TEST_DATABASE_URL;

test("isolamento multi-tenant: org A nunca vê/altera favoritos da org B", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../src/lib/prisma");
  const { tenantDb } = await import("../src/lib/tenancy");
  const sfx = Date.now().toString(36);
  await prisma.plan.upsert({ where: { id: "T" }, update: {}, create: { id: "T", name: "T" } });
  const [orgA, orgB] = await Promise.all(["a", "b"].map((n) => prisma.organization.create({ data: { name: n, slug: `${n}-${sfx}`, planId: "T" } })));
  const [uA, uB] = await Promise.all(["a", "b"].map((n) => prisma.user.create({ data: { email: `${n}-${sfx}@t.com`, passwordHash: "x" } })));
  const prop = await prisma.property.create({ data: {} });
  try {
    const a = tenantDb(orgA!.id, uA!.id).favorites, b = tenantDb(orgB!.id, uB!.id).favorites;
    await a.add(prop.id);
    assert.equal((await a.list()).length, 1);
    assert.equal((await b.list()).length, 0);
    assert.equal(await b.get(prop.id), null);
    assert.equal((await b.ids([prop.id])).size, 0);
    assert.equal((await b.update(prop.id, { note: "hack", label: null })).count, 0);
    assert.equal((await b.remove(prop.id)).count, 0);
    assert.equal((await a.list()).length, 1);
    // mesma org, outro usuário também não enxerga
    assert.equal((await tenantDb(orgA!.id, uB!.id).favorites.list()).length, 0);
    await a.add(prop.id); // idempotente
    assert.equal((await a.list()).length, 1);
  } finally {
    await prisma.favorite.deleteMany({ where: { propertyId: prop.id } });
    await prisma.property.delete({ where: { id: prop.id } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgA!.id, orgB!.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [uA!.id, uB!.id] } } });
    await prisma.$disconnect();
  }
});
