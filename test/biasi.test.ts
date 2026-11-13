import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseListPage, cardToListing, enrichWithDetail, type BiasiCard } from "../src/crawler/connectors/biasi/parser";
import { biasi } from "../src/crawler/connectors/biasi";
import type { CrawlContext } from "../src/crawler/core/connector";

const fx = (n: string) => readFileSync(new URL(`./fixtures/biasi/${n}`, import.meta.url), "utf8");
const p1 = parseListPage(fx("lista-p1.html"));
const last = parseListPage(fx("lista-ultima.html"));
const card = (id: string, title: string, o: Partial<BiasiCard> = {}): BiasiCard => ({
  id, url: `https://www.biasileiloes.com.br/lotes/${id}/x`, title, price: null, status: "Liberado para Lance", seller: null, image: null, ...o,
});
const lot = (file: string, c: BiasiCard) => enrichWithDetail(cardToListing(c), fx(file));

test("listagem: 48 cards por página, total de 388 lotes, última página parcial", () => {
  assert.equal(p1.cards.length, 48);
  assert.equal(p1.total, 388);
  assert.equal(new Set(p1.cards.map((c) => c.id)).size, 48);
  assert.equal(last.cards.length, 4);
});

test("card: preço, status, comitente e cidade/UF vêm da listagem", () => {
  const l = cardToListing(p1.cards[0]!);
  assert.equal(l.externalId, "64793");
  assert.equal(l.minBid, 468000);
  assert.equal(l.status, "OPEN");
  assert.equal(l.seller, "Itaú Unibanco");
  assert.equal(l.property.city, "Araruama");
  assert.equal(l.property.uf, "SP");
  assert.equal(l.property.type, "HOUSE");
});

test("lote Itaú: data, endereço, áreas, matrícula, ocupação, edital, fotos e coordenadas", () => {
  const l = lot("lote-itau-ocupado.html", p1.cards[0]!);
  assert.equal(l.rounds[0]!.date?.toISOString(), "2026-11-09T17:00:00.000Z");
  assert.equal(l.property.street, "Rua São Pedro");
  assert.equal(l.property.number, "95");
  assert.equal(l.property.neighborhood, "Areal");
  assert.equal(l.property.city, "Araruama"); // o subtítulo traz "Araraquara" por erro; vale o título
  assert.equal(l.property.privateArea, 337.73);
  assert.equal(l.property.registry, "60.271");
  assert.equal(l.property.registryOffice, "Ofício 2");
  assert.equal(l.property.occupation, "OCCUPIED");
  assert.equal(l.seller, "Itaú Unibanco S/A");
  assert.match(l.noticeUrl!, /leilaoanexo\/\d+\/\d+\.pdf$/);
  assert.equal(l.images.length, 5);
  assert.equal(l.property.geoPrecision, "SOURCE");
  assert.equal(l.property.lat, -22.89894373);
  assert.notEqual(l.property.zip, "04304010"); // CEP do rodapé do site
});

test("lote com endereço completo e CEP; bairro entre rua e cidade", () => {
  const l = lot("lote-acao-paralela.html", card("64972", "Casa - Rio Grande - São Bernardo do Campo/SP"));
  assert.equal(l.property.street, "RUA DAPHNIS");
  assert.equal(l.property.number, "200");
  assert.equal(l.property.neighborhood, "Rio Grande");
  assert.equal(l.property.zip, "09830070");
  assert.equal(l.property.landArea, 287.5);
  assert.equal(l.acceptsFinancing, true);
});

test("ação paralela (revisional) não torna o leilão judicial nem vira processo", () => {
  const l = lot("lote-acao-paralela.html", card("64972", "Casa - Rio Grande - São Bernardo do Campo/SP"));
  assert.equal(l.auctionType, "EXTRAJUDICIAL");
  assert.equal(l.caseNumber, null);
  assert.ok(!/4007277/.test(l.description ?? ""));
});

test("bairro composto longo: usa o bairro (antepenúltimo item), não o complemento", () => {
  const l = lot("lote-estruturado-cep.html", card("64884", "Casa - Lameirão - Maranguape/CE"));
  assert.equal(l.property.neighborhood, "Lameirão");
  assert.equal(l.property.street, "RUA FLOR SAUDADE");
  assert.equal(l.property.number, "195 D");
  assert.equal(l.property.zip, "61946430");
});

test("duas praças: data de cada uma; valor só da primeira", () => {
  const l = lot("lote-duas-pracas.html", card("65119", "Casa no Jardim Esplanada - Araguaína/TO"));
  assert.deepEqual(l.rounds.map((r) => r.number), [1, 2]);
  assert.equal(l.rounds[0]!.date?.toISOString(), "2026-11-25T13:10:00.000Z");
  assert.equal(l.rounds[1]!.date?.toISOString(), "2026-11-27T13:10:00.000Z");
  assert.equal(l.minBid, 650000);
});

test("descrição curta, sem a repetição do título nem cláusulas do edital", () => {
  const l = lot("lote-itau-ocupado.html", p1.cards[0]!);
  assert.ok(l.description!.length <= 600);
  assert.ok(!l.description!.startsWith(l.title));
  assert.ok(!/se exime de qualquer responsabilidade/i.test(l.description!));
});

test("discover: pagina de 48 em 48 até o total e filtra por UF", async () => {
  const requested: string[] = [];
  const http = { get: async (u: string) => { requested.push(u); return { status: 200, notModified: false, body: u.includes("start=0") ? fx("lista-p1.html") : fx("lista-ultima.html") }; } };
  const ctx = { http, filters: {}, log: () => {} } as unknown as CrawlContext;
  const refs = []; for await (const r of biasi.discover(ctx)) refs.push(r);
  assert.equal(requested.length, 9); // ceil(388 / 48)
  assert.match(requested[1]!, /start=48&limit=48/);
  const sp = []; for await (const r of biasi.discover({ ...ctx, filters: { uf: "SP" } } as CrawlContext)) sp.push(r);
  assert.ok(sp.length > 0 && sp.length < refs.length);
});

test("BIASI_DETAIL=0 publica só os dados do card", async () => {
  process.env.BIASI_DETAIL = "0";
  try {
    const ref = { externalId: "64793", url: p1.cards[0]!.url, data: p1.cards[0] };
    const raw = await biasi.fetchDetail!(ref, { http: { get: async () => { throw new Error("não deveria buscar"); } } } as unknown as CrawlContext);
    assert.equal(biasi.parse(raw)!.property.registry ?? null, null);
  } finally { delete process.env.BIASI_DETAIL; }
});

test("título com sufixo entre parênteses ainda informa cidade/UF; coordenada fora do Brasil é descartada", () => {
  const l = cardToListing(card("65059", "Terreno no Posto do Castelo em São Carlos/SP (Parte C)"));
  assert.equal(l.property.uf, "SP");
  assert.equal(l.property.city, "São Carlos");
  assert.equal(cardToListing(card("65064", "Apartamento no Centro de São Carlos/SP (Apto. n° 02)")).property.city, null); // ambíguo até o detalhe
  const html = fx("lote-itau-ocupado.html").replace(/(id="long" value=")[^"]*"/, '$1+46.5"');
  const e = enrichWithDetail(cardToListing(p1.cards[0]!), html);
  assert.equal(e.property.lat ?? null, null);
  assert.equal(e.property.geoPrecision ?? null, null);
});
