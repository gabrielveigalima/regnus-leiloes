import test from "node:test";
import assert from "node:assert/strict";
import type { Connector, NormalizedListing } from "../src/crawler/core/connector";

const url = process.env.TEST_DATABASE_URL;

test("listagem não desfaz o detalhe; modo enrich só detalha o que falta e não fecha anúncios", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const { prisma } = await import("../src/lib/prisma");
  const { runConnector } = await import("../src/crawler/core/runner");
  const sfx = Date.now().toString(36);
  const SRC = `enr${sfx}`, city = `Enr${sfx}`;
  await prisma.source.create({ data: { id: SRC, name: SRC, type: "BANK", baseUrl: "http://x" } });

  const future = (d: number) => new Date(Date.now() + d * 86_400_000);
  const item = (ext: string, o: Partial<NormalizedListing> = {}, prop: Partial<NormalizedListing["property"]> = {}): NormalizedListing => ({
    externalId: ext, url: `https://x/${ext}`, title: `Imóvel ${ext}`, auctionType: "EXTRAJUDICIAL", status: "OPEN", minBid: 100000, appraisalValue: null,
    acceptsFinancing: false, acceptsFgts: false, rounds: [], images: [], detail: false,
    property: { type: "HOUSE", city, uf: "SP", occupation: "UNKNOWN", street: `Rua ${ext}`, number: "1", ...prop }, ...o,
  });
  const detailed = (ext: string, minBid = 100000) => item(ext, {
    detail: true, minBid, appraisalValue: 200000, rounds: [{ number: 1, date: future(5), minBid }, { number: 2, date: future(12), minBid: minBid / 2 }],
    images: ["https://img/1.jpg"],
  }, { registry: `R${ext}`, zip: "13000000" });
  const listOnly = (ext: string, minBid: number) => item(ext, { minBid });
  const conn = (items: NormalizedListing[]): Connector => ({
    id: SRC, async *discover() { for (const i of items) yield { externalId: i.externalId, url: i.url, data: i }; },
    parse: (raw) => raw.body as NormalizedListing,
  });
  const get = (ext: string) => prisma.listing.findUniqueOrThrow({ where: { sourceId_externalId: { sourceId: SRC, externalId: ext } }, include: { rounds: true, images: true, events: true, property: true } });

  try {
    // 1) anúncio detalhado
    await runConnector(conn([detailed("a")]));
    const a1 = await get("a");
    assert.ok(a1.detailAt);
    assert.equal(a1.rounds.length, 2);

    // 2) listagem posterior (sem detalhe, preço mudou): preserva tudo, só registra o preço
    const r = await runConnector(conn([listOnly("a", 90000)]));
    const a2 = await get("a");
    assert.equal(r.updated, 1);
    assert.equal(Number(a2.minBid), 90000);
    assert.equal(Number(a2.discountPct), 55); // 1 - 90000/200000
    assert.equal(a2.rounds.length, 2);
    assert.ok(a2.rounds.every((x) => x.date));
    assert.equal(a2.nextAuctionAt?.getTime(), a1.nextAuctionAt?.getTime());
    assert.equal(a2.images.length, 1);
    assert.equal(a2.property?.registry, "Ra");
    assert.equal(a2.status, "OPEN");
    assert.equal(a2.detailAt?.getTime(), a1.detailAt?.getTime());
    assert.deepEqual(a2.events.map((e) => e.kind).sort(), ["CREATED", "PRICE_CHANGE"], "listagem não pode gerar DATE_CHANGE/STATUS_CHANGE");
    // mesma listagem de novo: nada muda
    assert.equal((await runConnector(conn([listOnly("a", 90000)]))).updated, 0);

    // 3) anúncio novo só da listagem
    await runConnector(conn([listOnly("a", 90000), listOnly("b", 50000)]));
    const b1 = await get("b");
    assert.equal(b1.detailAt, null);
    assert.equal(b1.rounds.length, 0);

    // 4) modo enrich: pula o já detalhado ("a"), detalha "b"; não fecha nada
    const e = await runConnector(conn([detailed("a", 90000), detailed("b", 50000)]), { enrichOnly: true });
    assert.equal(e.seen, 1);
    const b2 = await get("b");
    assert.ok(b2.detailAt);
    assert.equal(b2.rounds.length, 2);
    assert.equal(b2.property?.registry, "Rb");
    assert.equal((await get("a")).events.length, a2.events.length); // "a" não foi tocado
    const run = await prisma.crawlRun.findFirstOrThrow({ where: { sourceId: SRC }, orderBy: { startedAt: "desc" } });
    assert.equal(run.isFull, false);
    // enrich de novo: nada a fazer
    assert.equal((await runConnector(conn([detailed("a", 90000), detailed("b", 50000)]), { enrichOnly: true })).seen, 0);
  } finally {
    await prisma.listing.deleteMany({ where: { sourceId: SRC } });
    await prisma.property.deleteMany({ where: { city } });
    await prisma.crawlRun.deleteMany({ where: { sourceId: SRC } });
    await prisma.source.delete({ where: { id: SRC } });
    await prisma.$disconnect();
  }
});
