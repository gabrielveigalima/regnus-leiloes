import test from "node:test";
import assert from "node:assert/strict";
import type { GeocodeProvider, GeoQuery } from "../src/lib/geocode";

// Import dinâmico: o cliente Prisma é criado ao carregar o módulo, depois de definirmos DATABASE_URL.
const load = () => { if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; return import("../src/lib/geocode"); };

test("tentativas: endereço → rua → cidade, e só cidade quando não há rua", async () => {
  const { buildAttempts } = await load();
  const a = buildAttempts({ street: "RUA A", number: "10", city: "Campinas", uf: "SP" });
  assert.deepEqual(a.map((x) => x.precision), ["ADDRESS", "STREET", "CITY"]);
  assert.deepEqual(buildAttempts({ city: "Campinas", uf: "SP" }).map((x) => x.precision), ["CITY"]);
  assert.deepEqual(buildAttempts({ street: "RUA A", number: "10" }), []); // sem cidade/UF não geocodifica
});
test("chave de cache ignora acentos, caixa e prefixos de logradouro", async () => {
  const { cacheKey } = await load();
  const k1 = cacheKey("n", { street: "Avenida São João", number: "5", city: "São Paulo", uf: "SP" });
  const k2 = cacheKey("n", { street: "AV SAO JOAO", number: "5", city: "SAO PAULO", uf: "SP" });
  assert.equal(k1, k2);
  assert.notEqual(k1, cacheKey("outro", { street: "AV SAO JOAO", number: "5", city: "SAO PAULO", uf: "SP" }));
});
test("inBrazil rejeita coordenadas fora do país", async () => {
  const { inBrazil } = await load();
  assert.equal(inBrazil({ lat: -23.5, lng: -46.6 }), true);
  assert.equal(inBrazil({ lat: 40.4, lng: -3.7 }), false);
});

const url = process.env.TEST_DATABASE_URL;
test("lote: usa precisão decrescente, cacheia (inclusive negativo) e não retenta falhas", { skip: !url }, async () => {
  const { geocodeBatch } = await load();
  const { prisma } = await import("../src/lib/prisma");
  const sfx = Date.now().toString(36);
  const city = `GeoCity${sfx}`;
  const mk = (street: string | null, number: string | null) => prisma.property.create({ data: { city, uf: "SP", street, number } });
  const [exato, soRua, soCidade, ruaIgual] = await Promise.all([mk("RUA EXATA", "1"), mk("RUA SO RUA", "2"), mk("RUA DESCONHECIDA", "3"), mk("RUA EXATA", "1")]);
  const calls: GeoQuery[] = [];
  const provider: GeocodeProvider = {
    name: "fake",
    async geocode(q) {
      calls.push(q);
      if (q.street === "RUA EXATA" && q.number) return { lat: -22.9, lng: -47.0 };
      if (q.street === "RUA SO RUA" && !q.number) return { lat: -22.8, lng: -47.1 };
      if (!q.street) return { lat: -22.7, lng: -47.2 };
      return null;
    },
  };
  try {
    const stats = await geocodeBatch({ limit: 1000, provider, filter: { city } });
    const get = (id: string) => prisma.property.findUniqueOrThrow({ where: { id } });
    assert.equal((await get(exato.id)).geoPrecision, "ADDRESS");
    assert.equal((await get(soRua.id)).geoPrecision, "STREET");
    assert.equal((await get(soCidade.id)).geoPrecision, "CITY");
    assert.equal((await get(ruaIgual.id)).geoPrecision, "ADDRESS");
    assert.ok(stats.cacheHits >= 1, "segundo imóvel idêntico deveria usar o cache");
    // mesma consulta (RUA EXATA 1) só vai ao provedor uma vez
    assert.equal(calls.filter((c) => c.street === "RUA EXATA" && c.number === "1").length, 1);
    // já geocodificados não são reprocessados
    const before = calls.length;
    await geocodeBatch({ limit: 1000, provider, filter: { city } });
    assert.equal(calls.length, before);
    // falha transitória do provedor: propaga e NÃO marca como tentado
    const novo = await mk("RUA NOVA", "9");
    await assert.rejects(geocodeBatch({ limit: 1000, filter: { city }, provider: { name: "fake", geocode: async () => { throw new Error("429"); } } }));
    assert.equal((await get(novo.id)).geocodedAt, null);
  } finally {
    await prisma.property.deleteMany({ where: { city } });
    await prisma.geocodeCache.deleteMany({ where: { provider: "fake" } });
    await prisma.$disconnect();
  }
});
