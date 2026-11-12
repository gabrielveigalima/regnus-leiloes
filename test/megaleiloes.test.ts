import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseListPage, cardToListing, enrichWithDetail } from "../src/crawler/connectors/megaleiloes/parser";
import { megaleiloes } from "../src/crawler/connectors/megaleiloes";
import type { CrawlContext } from "../src/crawler/core/connector";

const fx = (n: string) => readFileSync(new URL(`./fixtures/megaleiloes/${n}`, import.meta.url), "utf8");
const p1 = parseListPage(fx("imoveis-p1.html"));
const p18 = parseListPage(fx("imoveis-p18.html"));
const card = (code: string) => p1.cards.find((c) => c.code === code)!;

test("lista: 48 cards na página 1 e 18 páginas no total", () => {
  assert.equal(p1.cards.length, 48);
  assert.equal(p1.lastPage, 18);
  assert.equal(new Set(p1.cards.map((c) => c.code)).size, 48);
  assert.ok(p1.cards.every((c) => !c.url.includes("utm_")));
});

test("card extrajudicial de praça única", () => {
  const l = cardToListing(card("X131091"));
  assert.equal(l.externalId, "X131091");
  assert.equal(l.auctionType, "EXTRAJUDICIAL");
  assert.equal(l.status, "OPEN");
  assert.equal(l.minBid, 214200);
  assert.equal(l.seller, "Itaú");
  assert.equal(l.property.type, "APARTMENT");
  assert.equal(l.property.city, "Salvador");
  assert.equal(l.property.uf, "BA");
  assert.equal(l.property.neighborhood, "Nazaré");
  assert.equal(l.property.privateArea, 129);
  assert.equal(l.rounds.length, 1);
  assert.equal(l.rounds[0]!.date?.toISOString(), "2026-11-13T18:00:00.000Z");
});

test("card judicial com duas praças; leiloeiro não vira comitente", () => {
  const l = cardToListing(card("J130030"));
  assert.equal(l.auctionType, "JUDICIAL");
  assert.equal(l.seller, null);
  assert.deepEqual(l.rounds.map((r) => [r.number, r.minBid]), [[1, 156536.95], [2, 78268.48]]);
  assert.equal(l.rounds[1]!.date?.toISOString(), "2026-11-30T13:00:00.000Z");
});

test("vagas e terreno: área vai para o campo certo", () => {
  const land = p1.cards.map(cardToListing).find((l) => l.property.type === "LAND");
  if (land) assert.ok(land.property.landArea && !land.property.privateArea);
  const park = p1.cards.map(cardToListing).find((l) => /01 vaga/i.test(l.title));
  assert.equal(park?.property.parking, 1);
});

test("página 18: lotes 'Em breve' viram UPCOMING", () => {
  const statuses = new Set(p18.cards.map((c) => cardToListing(c).status));
  assert.ok(statuses.has("UPCOMING"));
  assert.ok(p18.cards.length > 0 && p18.cards.length < 48);
});

test("detalhe judicial: avaliação, processo, matrícula, edital, fotos; sem nomes das partes (LGPD)", () => {
  const l = enrichWithDetail(cardToListing(card("J130030")), fx("detalhe-judicial-j130030.html"));
  assert.equal(l.appraisalValue, 156536.95);
  assert.equal(l.caseNumber, "1016881-52.2017.8.26.0224");
  assert.equal(l.property.street, "Rua Doutor Eloy Chaves");
  assert.equal(l.property.number, "293");
  assert.equal(l.property.registry, "20.729");
  assert.equal(l.property.registryOffice, "Ofício 01");
  assert.match(l.noticeUrl!, /edital.*\.pdf$/);
  assert.ok(l.images.length >= 3 && l.images.every((u) => /batches\/130030\//.test(u)));
  const text = `${l.description} ${l.title}`;
  assert.ok(!/COCCI|FLYPARK|WINKALER/i.test(text), "nome de parte vazou na descrição");
});

test("detalhe extrajudicial: comitente, ocupação e matrícula do lote (não de outros lotes)", () => {
  const l = enrichWithDetail(cardToListing(card("X131091")), fx("detalhe-extrajudicial-x131091.html"));
  assert.equal(l.seller, "ITAÚ UNIBANCO S/A");
  assert.equal(l.property.occupation, "OCCUPIED");
  assert.equal(l.property.registry, "26.347");
  assert.equal(l.property.registryOffice, "Ofício 4");
  assert.equal(l.appraisalValue ?? null, null); // "R$ 0,00 (não informado)" não é avaliação
});

test("discover: pagina até a última página e aplica filtro de UF", async () => {
  const requested: string[] = [];
  const http = { get: async (u: string) => { requested.push(u); return { status: 200, notModified: false, body: u.includes("pagina=18") ? fx("imoveis-p18.html") : fx("imoveis-p1.html") }; } };
  const ctx = { http, filters: {}, log: () => {} } as unknown as CrawlContext;
  const refs = [];
  for await (const r of megaleiloes.discover(ctx)) refs.push(r);
  assert.equal(requested.length, 18);
  assert.equal(requested[0], "https://www.megaleiloes.com.br/imoveis");
  assert.equal(requested[1], "https://www.megaleiloes.com.br/imoveis?pagina=2");

  const sp = [];
  for await (const r of megaleiloes.discover({ ...ctx, filters: { uf: "SP" } } as CrawlContext)) sp.push(r);
  assert.ok(sp.length > 0 && sp.length < refs.length);
  assert.ok(sp.every((r) => /-sp-[xj]\d+$/.test(r.url)));
});
