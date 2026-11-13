import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cardToListing, enrichWithDetail, parseListPage, parseTitle } from "../src/crawler/connectors/lancejudicial/parser";
import { lancejudicial } from "../src/crawler/connectors/lancejudicial";
import type { CrawlContext } from "../src/crawler/core/connector";

const fx = (n: string) => readFileSync(new URL(`./fixtures/lance/${n}`, import.meta.url), "utf8");
const p1 = parseListPage(fx("imoveis-p1.html"));
const p9 = parseListPage(fx("imoveis-p9.html"));
const NOW = new Date("2026-11-13T00:00:00-03:00");
const card = (id: string) => p1.cards.find((c) => c.id === id)!;
const lot = (file: string, id: string) => enrichWithDetail(cardToListing(card(id), NOW), fx(file), NOW);

test("listagem: 286 lotes em 9 páginas de 32; última página parcial 'Em breve'", () => {
  assert.equal(p1.total, 286);
  assert.equal(p1.pages, 9);
  assert.equal(p1.cards.length, 32);
  assert.equal(p9.cards.length, 30);
  assert.equal(new Set(p1.cards.map((c) => c.id)).size, 32);
  assert.ok(p9.cards.every((c) => /breve/i.test(c.status)));
  assert.ok(p1.cards.every((c) => c.url.startsWith("https://www.grupolance.com.br/")));
});

test("título livre: tipo, áreas A.T./A.C., bairro, cidade/UF", () => {
  const t = parseTitle("Casa, A.T.: 788m², A.C.: 233m², Vila Muriqui, Mangaratiba/RJ");
  assert.deepEqual([t.type, t.city, t.uf, t.neighborhood, t.landArea, t.builtArea], ["HOUSE", "Mangaratiba", "RJ", "Vila Muriqui", 788, 233]);
  const s = parseTitle("Terreno, 30.034m², Moreno/PE");
  assert.deepEqual([s.type, s.city, s.uf, s.neighborhood], ["LAND", "Moreno", "PE", null]);
});

test("card: preço, tipo de leilão e status; 'Em breve' vira UPCOMING", () => {
  const a = cardToListing(card("29034"), NOW);
  assert.equal(a.minBid, 350000);
  assert.equal(a.auctionType, "JUDICIAL");
  assert.equal(a.status, "OPEN");
  assert.equal(cardToListing(card("27553"), NOW).auctionType, "EXTRAJUDICIAL");
  assert.equal(cardToListing(p9.cards[0]!, NOW).status, "UPCOMING");
});

test("lote da PGFN (judicial): praças, avaliação, processo, coordenadas, edital; sem Autor/Réu", () => {
  const l = lot("lote-terreno-judicial.html", "29034");
  assert.equal(l.detail, true);
  assert.equal(l.appraisalValue, 350000);
  assert.deepEqual(l.rounds.map((r) => [r.number, r.minBid]), [[1, 350000], [2, 262500]]);
  assert.equal(l.rounds[1]!.date?.toISOString(), "2026-12-12T11:00:00.000Z");
  assert.equal(l.caseNumber, "5034328-59.2014.4.04.7200");
  assert.equal(l.seller, "Procuradoria-Geral da Fazenda Nacional (PGFN)");
  assert.equal(l.property.street, "Rua Maria Isolina da Silva");
  assert.equal(l.property.lat, -27.671647);
  assert.equal(l.property.geoPrecision, "SOURCE");
  assert.match(l.noticeUrl!, /^https:\/\/cdn\.grupolance\.com\.br\/.*edital.*\.pdf/);
  assert.ok(l.images.length >= 2 && l.images.every((u) => !/_thumb/.test(u)));
  const all = JSON.stringify(l);
  assert.ok(!/MACROBOATS|UNIÃO - FAZENDA/i.test(all), "nome das partes vazou");
  assert.ok(!/O que é o Comprei/i.test(l.description ?? ""), "texto padrão da PGFN não deve virar descrição");
});

test("lote judicial comum: descrição do bem, áreas e processo", () => {
  const l = lot("lote-apartamento.html", "28879");
  assert.equal(l.property.type, "APARTMENT");
  assert.equal(l.property.privateArea, 112);
  assert.equal(l.caseNumber, "1002517-63.2025.8.26.0590");
  assert.match(l.description ?? "", /APARTAMENTO nº 201/);
  assert.ok(!/RICARDO CAPUSSO|CONDOMINIO EDIFICIO BRASIL/i.test(JSON.stringify(l)), "nome das partes vazou");
});

test("lote extrajudicial (venda direta): sem processo, ocupação e áreas dos ícones", () => {
  const l = lot("lote-extrajudicial-sobrado.html", "27553");
  assert.equal(l.auctionType, "EXTRAJUDICIAL");
  assert.equal(l.caseNumber, null);
  assert.equal(l.appraisalValue, 3500000);
  assert.equal(l.property.occupation, "UNOCCUPIED");
  assert.equal(l.property.landArea, 518);
  assert.equal(l.property.privateArea, 234);
});

test("discover: pagina até a última página e filtra UF; LANCE_DETAIL=0 publica só o card", async () => {
  const urls: string[] = [];
  const http = { get: async (u: string) => { urls.push(u); return { status: 200, notModified: false, body: u.includes("pagina=9") ? fx("imoveis-p9.html") : fx("imoveis-p1.html") }; } };
  const ctx = { http, filters: {}, log: () => {} } as unknown as CrawlContext;
  const refs = []; for await (const r of lancejudicial.discover(ctx)) refs.push(r);
  assert.equal(urls.length, 9);
  assert.equal(urls[0], "https://www.grupolance.com.br/imoveis");
  assert.equal(urls[1], "https://www.grupolance.com.br/imoveis?pagina=2");
  const sp = []; for await (const r of lancejudicial.discover({ ...ctx, filters: { uf: "SP" } } as CrawlContext)) sp.push(r);
  assert.ok(sp.length > 0 && sp.length < refs.length);
  process.env.LANCE_DETAIL = "0";
  try {
    const raw = await lancejudicial.fetchDetail!(refs[0]!, { http: { get: async () => { throw new Error("não deveria buscar"); } } } as unknown as CrawlContext);
    assert.equal(lancejudicial.parse(raw)?.detail, false);
  } finally { delete process.env.LANCE_DETAIL; }
});
