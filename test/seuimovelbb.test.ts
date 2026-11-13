import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardToListing, dateFromCard, enrichWithDetail, parseCatalogResponse, parseToken, type BBCard } from "../src/crawler/connectors/seuimovelbb/parser";
import { seuimovelbb } from "../src/crawler/connectors/seuimovelbb";
import type { CrawlContext } from "../src/crawler/core/connector";

const fx = (n: string) => readFileSync(new URL(`./fixtures/seuimovelbb/${n}`, import.meta.url), "utf8");
const p1 = parseCatalogResponse(fx("catalogo-p1.json"));
const p8 = parseCatalogResponse(fx("catalogo-p8.json"));
const p20 = parseCatalogResponse(fx("catalogo-p20.json"));
const NOW = new Date("2026-11-12T12:00:00-03:00");
const card = (o: Partial<BBCard>): BBCard => ({ id: "1", type: "Casa", price: null, city: "Cidade", uf: "SP", auctionText: null, partner: null, acceptsBB: false, ...o });

test("token da sessão e catálogo: 975 imóveis, 50 por página, última com 25", () => {
  assert.equal(parseToken(fx("catalogo-pagina.html")), "559d43f92c316c5ae6403390bfd7db7a");
  assert.equal(p1.total, 975);
  assert.deepEqual([p1.cards.length, p8.cards.length, p20.cards.length], [50, 50, 25]);
  assert.equal(new Set(p1.cards.map((c) => c.id)).size, 50);
  assert.throws(() => parseCatalogResponse('{"erro":"sessão expirada"}'), /sessão expirada/);
});

test("card 'Aceita BB?' sem preço, com data do leilão; card com preço e sem data", () => {
  const a = cardToListing(p1.cards[0]!, NOW);
  assert.equal(a.externalId, "13276");
  assert.equal(a.minBid, null);
  assert.equal(a.seller, "Banco do Brasil");
  assert.equal(a.auctionType, "EXTRAJUDICIAL");
  assert.equal(a.rounds[0]!.date?.toISOString(), "2026-11-17T13:00:00.000Z");
  assert.equal(a.property.type, "APARTMENT");
  assert.equal(a.property.city, "Rio de Janeiro");
  assert.equal(a.property.uf, "RJ");
  const b = cardToListing(p8.cards[0]!, NOW);
  assert.equal(b.minBid, 16860);
  assert.equal(b.auctionType, "DIRECT_SALE");
  assert.equal(b.images[0], "https://seuimovelbb.com.br/imagem/imovel/110_1.jpg");
  assert.ok(p20.cards.every((c) => c.price != null));
});

test("data do card sem ano: próxima ocorrência futura (vira o ano em dezembro)", () => {
  assert.equal(dateFromCard("17/11 às 10h", NOW)?.toISOString(), "2026-11-17T13:00:00.000Z");
  assert.equal(dateFromCard("05/01 às 14h30", new Date("2026-12-20T12:00:00-03:00"))?.toISOString(), "2027-01-05T17:30:00.000Z");
  assert.equal(dateFromCard(null, NOW), null);
});

test("detalhe 'Aceita BB': matrícula, ofício, ocupação, endereço, coordenadas; preço dos relacionados não vaza", () => {
  const l = enrichWithDetail(cardToListing(p1.cards[0]!, NOW), fx("detalhe-aceita-bb-leilao.html"));
  assert.equal(l.detail, true);
  assert.equal(l.minBid, null);
  assert.equal(l.property.registry, "345766");
  assert.equal(l.property.registryOffice, "Ofício 9");
  assert.equal(l.property.occupation, "OCCUPIED");
  assert.equal(l.property.street, "estrada dos Bandeirantes");
  assert.equal(l.property.number, "7777");
  assert.equal(l.property.neighborhood, "Jacarepaguá");
  assert.equal(l.property.lat, -22.967106);
  assert.equal(l.property.geoPrecision, "SOURCE");
  assert.equal(l.images.length, 3);
  assert.ok(!/ocupado por terceiros/i.test(l.description ?? ""), "condições ficam fora da descrição");
});

test("detalhe com áreas, quartos e preço ('Valor para proposta')", () => {
  const l = enrichWithDetail(cardToListing(p8.cards[0]!, NOW), fx("detalhe-casa-com-preco.html"));
  assert.equal(l.minBid, 16860);
  assert.equal(l.property.privateArea, 96);
  assert.equal(l.property.totalArea, 125.33);
  assert.equal(l.property.landArea, 720);
  assert.equal(l.property.bedrooms, 2);
  assert.equal(l.property.registry, "59.044");
  assert.equal(l.property.type, "HOUSE");
});

test("tipos: prédio comercial, vaga de garagem e residência (o tipo do card prevalece)", () => {
  const predio = enrichWithDetail(cardToListing(card({ id: "13068", type: "Prédio", price: 8864074.05 }), NOW), fx("detalhe-predio-locado.html"));
  assert.equal(predio.property.type, "COMMERCIAL");
  assert.equal(predio.property.street, "Avenida DO CONTORNO");
  assert.equal(predio.property.registryOffice, "Ofício 6");
  const vaga = enrichWithDetail(cardToListing(card({ id: "10828", type: "Vaga de garagem" }), NOW), fx("detalhe-vaga.html"));
  assert.equal(vaga.property.type, "OTHER");
  assert.equal(vaga.property.number, "55");
  const rural = enrichWithDetail(cardToListing(card({ id: "11673" }), NOW), fx("detalhe-rural-ocupado.html"));
  assert.equal(rural.property.occupation, "OCCUPIED");
  assert.equal(rural.property.privateArea, 64.8);
  assert.equal(rural.property.landArea, 140);
});

test("discover: sessão (GET), token, POST de cada página até o total e filtro de UF", async () => {
  const calls: string[] = [];
  const http = {
    get: async (u: string) => { calls.push(`GET ${u}`); return { status: 200, notModified: false, body: fx("catalogo-pagina.html") }; },
    post: async (u: string, form: Record<string, string>) => {
      calls.push(`POST ${u} pagina=${form.pagina} token=${form.cppnp?.slice(0, 4)}`);
      const f = form.pagina === "1" ? "catalogo-p1.json" : form.pagina === "20" ? "catalogo-p20.json" : "catalogo-p8.json";
      return { status: 200, notModified: false, body: fx(f) };
    },
  };
  const ctx = { http, filters: {}, log: () => {} } as unknown as CrawlContext;
  const refs = []; for await (const r of seuimovelbb.discover(ctx)) refs.push(r);
  assert.equal(calls[0], "GET https://seuimovelbb.com.br/catalogo");
  assert.equal(calls.filter((c) => c.startsWith("POST")).length, 20); // ceil(975 / 50)
  assert.match(calls[1]!, /pagina=1 token=559d/);
  assert.equal(seuimovelbb.id, "bb");
  const rj = []; for await (const r of seuimovelbb.discover({ ...ctx, filters: { uf: "RJ" } } as CrawlContext)) rj.push(r);
  assert.ok(rj.length > 0 && rj.length < refs.length);
});

test("BB_DETAIL=0 publica só o card", async () => {
  process.env.BB_DETAIL = "0";
  try {
    const ref = { externalId: "110", url: "https://seuimovelbb.com.br/imovel/id/110", data: p8.cards[0] };
    const raw = await seuimovelbb.fetchDetail!(ref, { http: { get: async () => { throw new Error("não deveria buscar"); } } } as unknown as CrawlContext);
    const l = seuimovelbb.parse(raw);
    assert.equal(l!.detail, false);
    assert.equal(l!.minBid, 16860);
  } finally { delete process.env.BB_DETAIL; }
});
