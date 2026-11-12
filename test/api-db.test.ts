import test from "node:test";
import assert from "node:assert/strict";

const url = process.env.TEST_DATABASE_URL;

test("API v1: autenticação por chave, plano, UFs, paginação, rate limit e revogação", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  process.env.API_RATE_LIMIT = "1000";
  const { NextRequest } = await import("next/server");
  const { prisma } = await import("../src/lib/prisma");
  const { generateApiKey } = await import("../src/lib/api-keys");
  const list = await import("../src/app/api/v1/properties/route");
  const one = await import("../src/app/api/v1/properties/[id]/route");
  const { withApiKey } = await import("../src/lib/api-auth");
  const { FixedWindowLimiter } = await import("../src/lib/rate-limit");

  const sfx = Date.now().toString(36);
  const city = `Api${sfx}`;
  await prisma.plan.upsert({ where: { id: "API_ON" }, update: { allowedUfs: ["SP"] }, create: { id: "API_ON", name: "on", apiAccess: true, allowedUfs: ["SP"] } });
  await prisma.plan.upsert({ where: { id: "API_OFF" }, update: {}, create: { id: "API_OFF", name: "off", apiAccess: false } });
  const [orgOn, orgOff] = await Promise.all([
    prisma.organization.create({ data: { name: "on", slug: `on-${sfx}`, planId: "API_ON" } }),
    prisma.organization.create({ data: { name: "off", slug: `off-${sfx}`, planId: "API_OFF" } }),
  ]);
  const mk = async (org: string) => { const k = generateApiKey(); await prisma.apiKey.create({ data: { organizationId: org, name: "t", prefix: k.prefix, hash: k.hash } }); return k; };
  const [kOn, kOff] = [await mk(orgOn.id), await mk(orgOff.id)];
  await prisma.source.upsert({ where: { id: "apitest" }, update: {}, create: { id: "apitest", name: "ApiTest", type: "BANK", baseUrl: "http://a" } });
  const props = [] as { id: string; uf: string }[];
  for (const [i, uf] of ["SP", "SP", "SP", "RJ"].entries()) {
    const p = await prisma.property.create({ data: { city, uf, type: "HOUSE", street: `Rua ${i}`, lat: -23.5, lng: -46.6 } });
    await prisma.listing.create({ data: { sourceId: "apitest", externalId: `${i}-${sfx}`, propertyId: p.id, url: `https://orig/${i}`, title: `Imóvel ${i}`, minBid: 1000 + i, discountPct: 10 + i, status: "OPEN",
      rounds: { create: [{ number: 1, minBid: 1000 + i }] }, images: { create: [{ url: "https://img/1.jpg" }] } } });
    props.push({ id: p.id, uf });
  }
  const req = (path: string, key?: string, header: "bearer" | "x" = "bearer") =>
    new NextRequest(`http://localhost${path}`, { headers: key ? (header === "bearer" ? { authorization: `Bearer ${key}` } : { "x-api-key": key }) : {} });

  try {
    // sem chave / chave errada
    assert.equal((await list.GET(req("/api/v1/properties"))).status, 401);
    assert.equal((await list.GET(req("/api/v1/properties", kOn.key.slice(0, -1) + "x"))).status, 401);
    // plano sem API
    assert.equal((await list.GET(req("/api/v1/properties", kOff.key))).status, 403);

    // plano com UFs=[SP]: nunca devolve RJ; atribuição presente
    const r = await list.GET(req(`/api/v1/properties?cidade=${city}&limit=2&ordem=preco`, kOn.key));
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("x-ratelimit-limit"), "1000");
    const body = await r.json();
    assert.equal(body.data.length, 2);
    assert.equal(body.total, 3); // 3 em SP; o RJ fica fora do plano
    assert.ok(body.next_cursor);
    const first = body.data[0];
    assert.equal(first.listing.source.name, "ApiTest");
    assert.match(first.listing.source.url, /^https:\/\/orig\//);
    assert.equal(first.address.uf, "SP");
    assert.equal(first.listing.rounds.length, 1);
    assert.equal(first.location.lat, -23.5);

    // página 2 por cursor (X-API-Key também vale)
    const r2 = await list.GET(req(`/api/v1/properties?cidade=${city}&limit=2&ordem=preco&cursor=${body.next_cursor}`, kOn.key, "x"));
    const b2 = await r2.json();
    assert.equal(b2.data.length, 1);
    assert.equal(b2.next_cursor, null);
    assert.equal(b2.total, null);
    // UF fora do plano pedida explicitamente → vazio
    const rj = await (await list.GET(req(`/api/v1/properties?cidade=${city}&uf=RJ`, kOn.key))).json();
    assert.equal(rj.data.length, 0);

    // detalhe: SP ok, RJ 404
    const sp = props.find((p) => p.uf === "SP")!, rjp = props.find((p) => p.uf === "RJ")!;
    const d = await one.GET(req(`/api/v1/properties/${sp.id}`, kOn.key), { params: Promise.resolve({ id: sp.id }) });
    assert.equal(d.status, 200);
    assert.equal((await d.json()).data.listings[0].source.name, "ApiTest");
    assert.equal((await one.GET(req(`/api/v1/properties/${rjp.id}`, kOn.key), { params: Promise.resolve({ id: rjp.id }) })).status, 404);

    // rate limit por chave: 429 com Retry-After
    const rl = new FixedWindowLimiter(2, 60_000);
    const call = () => withApiKey(req("/x", kOn.key), async () => Response.json({ ok: true }), rl);
    assert.equal((await call()).status, 200);
    assert.equal((await call()).status, 200);
    const limited = await call();
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) >= 1);

    // revogada → 401
    await prisma.apiKey.updateMany({ where: { organizationId: orgOn.id }, data: { revokedAt: new Date() } });
    assert.equal((await list.GET(req("/api/v1/properties", kOn.key))).status, 401);
  } finally {
    await prisma.listing.deleteMany({ where: { sourceId: "apitest" } });
    await prisma.property.deleteMany({ where: { city } });
    await prisma.source.delete({ where: { id: "apitest" } });
    await prisma.organization.deleteMany({ where: { id: { in: [orgOn.id, orgOff.id] } } });
    await prisma.$disconnect();
  }
});
