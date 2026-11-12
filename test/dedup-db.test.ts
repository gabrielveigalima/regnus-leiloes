import test from "node:test";
import assert from "node:assert/strict";
import type { Connector, NormalizedListing } from "../src/crawler/core/connector";

const url = process.env.TEST_DATABASE_URL;

test("dedup no runner: funde com alta confiança, cria candidatos, respeita mesma fonte, mescla e rejeita", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../src/lib/prisma");
  const { runConnector } = await import("../src/crawler/core/runner");
  const { mergeProperties, rejectCandidate, orderPair } = await import("../src/lib/dedup");
  const sfx = Date.now().toString(36);
  const city = `Dd${sfx}`, A = `dda${sfx}`, B = `ddb${sfx}`;
  for (const id of [A, B]) await prisma.source.create({ data: { id, name: id, type: "BANK", baseUrl: "http://x" } });

  const item = (ext: string, o: Partial<NormalizedListing["property"]> = {}, bid = 100000): NormalizedListing => ({
    externalId: ext, url: `https://x/${ext}`, title: `Imóvel ${ext}`, auctionType: "EXTRAJUDICIAL", status: "OPEN", minBid: bid, appraisalValue: 200000,
    acceptsFinancing: false, acceptsFgts: false, rounds: [], images: [],
    property: { type: "APARTMENT", street: "RUA DAS FLORES", number: "100", complement: "Apto 52", city, uf: "SP", privateArea: 60, occupation: "UNKNOWN", ...o },
  });
  const fake = (id: string, items: NormalizedListing[]): Connector => ({
    id, async *discover() { for (const i of items) yield { externalId: i.externalId, url: i.url, data: i }; },
    parse: (raw) => raw.body as NormalizedListing,
  });
  const props = () => prisma.property.findMany({ where: { city }, include: { listings: true } });

  try {
    await runConnector(fake(A, [item("a1")]));
    // B: mesmo imóvel (grafia diferente, área 61 ≈ 60) -> funde sozinho
    await runConnector(fake(B, [item("b1", { street: "R DAS FLORES", privateArea: 61 })]));
    let all = await props();
    assert.equal(all.length, 1);
    assert.equal(all[0]!.listings.length, 2);

    // B: parecido, mas sem área -> NÃO funde, vira candidato
    await runConnector(fake(B, [item("b1", { street: "R DAS FLORES", privateArea: 61 }), item("b2", { street: "R DAS FLORES", privateArea: null, complement: null, number: "100" })]));
    all = await props();
    assert.equal(all.length, 2, "não deveria fundir com baixa confiança");
    const cands = await prisma.duplicateCandidate.findMany({ where: { OR: [{ propertyA: { city } }, { propertyB: { city } }] } });
    assert.equal(cands.length, 1);
    assert.equal(cands[0]!.status, "PENDING");

    // mesma fonte relistando o mesmo endereço (ex.: outra unidade sem complemento) -> nunca funde sozinha
    await runConnector(fake(A, [item("a1"), item("a2")]));
    all = await props();
    assert.equal(all.length, 3, "mesma fonte com anúncio ativo não pode fundir automaticamente");
    assert.equal(all.flatMap((p) => p.listings).length, 4);

    // reexecutar não duplica candidatos
    const before = await prisma.duplicateCandidate.count({ where: { OR: [{ propertyA: { city } }, { propertyB: { city } }] } });
    await runConnector(fake(A, [item("a1"), item("a2")]));
    assert.equal(await prisma.duplicateCandidate.count({ where: { OR: [{ propertyA: { city } }, { propertyB: { city } }] } }), before);

    // rejeitar mantém status e não é recriado
    await rejectCandidate(cands[0]!.id);
    await runConnector(fake(B, [item("b1", { street: "R DAS FLORES", privateArea: 61 }), item("b2", { street: "R DAS FLORES", privateArea: null, complement: null })]));
    assert.equal((await prisma.duplicateCandidate.findUniqueOrThrow({ where: { id: cands[0]!.id } })).status, "REJECTED");

    // mesclar move anúncios e resolve conflito de favoritos
    const [p1, p2] = (await props()).slice(0, 2);
    const plan = await prisma.plan.upsert({ where: { id: "DD" }, update: {}, create: { id: "DD", name: "DD" } });
    const org = await prisma.organization.create({ data: { name: "dd", slug: `dd-${sfx}`, planId: plan.id } });
    const user = await prisma.user.create({ data: { email: `dd-${sfx}@t.com`, passwordHash: "x" } });
    await prisma.favorite.createMany({ data: [{ organizationId: org.id, userId: user.id, propertyId: p1!.id }, { organizationId: org.id, userId: user.id, propertyId: p2!.id, note: "dup" }] });
    const [keep, drop] = orderPair(p1!.id, p2!.id).map((id) => (id === p1!.id ? p1! : p2!));
    const nListings = keep!.listings.length + drop!.listings.length;
    await mergeProperties(keep!.id, drop!.id);
    const merged = await prisma.property.findUniqueOrThrow({ where: { id: keep!.id }, include: { listings: true } });
    assert.equal(merged.listings.length, nListings);
    assert.equal(await prisma.property.count({ where: { id: drop!.id } }), 0);
    assert.equal(await prisma.favorite.count({ where: { userId: user.id } }), 1); // sem violar a unicidade
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.user.delete({ where: { id: user.id } });
  } finally {
    await prisma.listing.deleteMany({ where: { sourceId: { in: [A, B] } } });
    await prisma.property.deleteMany({ where: { city } });
    await prisma.crawlRun.deleteMany({ where: { sourceId: { in: [A, B] } } });
    await prisma.source.deleteMany({ where: { id: { in: [A, B] } } });
    await prisma.$disconnect();
  }
});
