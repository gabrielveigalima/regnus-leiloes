import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseLot, parseSitemap, ufFromUrl } from "../src/crawler/connectors/frazao/parser";
import { frazao } from "../src/crawler/connectors/frazao";
import type { CrawlContext } from "../src/crawler/core/connector";

const fx = (n: string) => readFileSync(new URL(`./fixtures/frazao/${n}`, import.meta.url), "utf8");
const lot = (name: string, id: number) => parseLot(fx(`${name}.html`), `https://www.frazaoleiloes.com.br/lote/${id}-slug?utm=x`);

test("sitemap: ids e URLs dos lotes; UF pelo sufixo do slug", () => {
  const items = parseSitemap(fx("sitemap-lotes.xml"));
  assert.equal(items.length, 40);
  assert.equal(items[0]!.id, "42234");
  assert.equal(ufFromUrl(items[0]!.url), "SP");
  assert.equal(ufFromUrl("https://x/lote/43915-casa-padrao-1-vagas-de-garagem"), null);
});

test("lote com caixa 'Lance mínimo' (terreno desocupado)", () => {
  const l = lot("lote-boxed-desocupado", 42234);
  assert.equal(l.externalId, "42234");
  assert.equal(l.url, "https://www.frazaoleiloes.com.br/lote/42234-slug");
  assert.equal(l.status, "OPEN");
  assert.equal(l.minBid, 1398200);
  assert.equal(l.property.type, "LAND");
  assert.equal(l.property.occupation, "UNOCCUPIED");
  assert.equal(l.property.landArea, 2258.94);
  assert.equal(l.property.city, "Bragança Paulista");
  assert.equal(l.property.uf, "SP");
  assert.equal(l.property.registry, "60.335");
  assert.equal(l.seller, "Itau Unibanco S/A");
  assert.equal(l.rounds[0]!.date?.toISOString(), "2026-11-12T14:00:00.000Z");
});

test("lote estruturado: avaliação, CEP, endereço completo, quartos e vagas", () => {
  const l = lot("lote-estruturado", 43915);
  assert.equal(l.minBid, 60000);
  assert.equal(l.appraisalValue, 100000);
  assert.equal(l.property.street, "RUA VEREADOR CLICERIO DE OLIVEIRA");
  assert.equal(l.property.number, "991");
  assert.equal(l.property.zip, "63490000");
  assert.equal(l.property.city, "Jaguaribara");
  assert.equal(l.property.privateArea, 105);
  assert.equal(l.property.bedrooms, 2);
  assert.equal(l.property.parking, 1);
  assert.equal(l.property.registryOffice, "Ofício 1");
  assert.equal(l.property.occupation, "OCCUPIED");
  assert.equal(l.images.length, 6);
});

test("alienação fiduciária com duas praças e valores por praça", () => {
  const l = lot("lote-duas-pracas", 44130);
  assert.deepEqual(l.rounds.map((r) => [r.number, r.minBid]), [[1, 333033.06], [2, 378799.89]]);
  assert.equal(l.rounds[1]!.date?.toISOString(), "2026-12-02T19:00:00.000Z");
  assert.equal(l.minBid, 333033.06);
  assert.equal(l.property.privateArea, 22.843);
  assert.equal(l.property.registryOffice, "Ofício 05");
});

test("CEP do rodapé do site não vaza para o imóvel; coordenadas da fonte são usadas", () => {
  for (const [n, id] of [["lote-boxed-ocupado", 44098], ["lote-texto-livre", 43813], ["lote-boxed-desocupado", 42234]] as const) {
    const l = lot(n, id);
    assert.notEqual(l.property.zip, "03062000", `${n}: CEP do rodapé`);
    assert.equal(l.property.geoPrecision, "SOURCE");
    assert.ok(l.property.lat! < 0 && l.property.lng! < 0);
  }
  assert.equal(lot("lote-boxed-ocupado", 44098).property.lat, -22.241504912);
});

test("texto livre: terreno e área construída; 'na Rua do Rio' não vira bairro", () => {
  const l = lot("lote-texto-livre", 43813);
  assert.equal(l.property.landArea, 28071.18);
  assert.equal(l.property.privateArea, 142.48);
  assert.equal(l.property.neighborhood, null);
  assert.equal(l.property.number, null); // "s/nº"
  assert.equal(l.auctionType, "EXTRAJUDICIAL");
});

test("descrição curta, sem observações; URL inválida falha", () => {
  const l = lot("lote-texto-livre", 43813);
  assert.ok(l.description!.length <= 600);
  assert.ok(!/Vendedor se exime/i.test(l.description!));
  assert.throws(() => parseLot("<html></html>", "https://www.frazaoleiloes.com.br/outra"));
});

test("discover: lê o sitemap e filtra por UF só quando o slug informa a UF", async () => {
  const http = { get: async () => ({ status: 200, notModified: false, body: fx("sitemap-lotes.xml") }) };
  const ctx = { http, filters: {}, log: () => {} } as unknown as CrawlContext;
  const all = []; for await (const r of frazao.discover(ctx)) all.push(r);
  assert.equal(all.length, 40);
  const sp = []; for await (const r of frazao.discover({ ...ctx, filters: { uf: "SP" } } as CrawlContext)) sp.push(r);
  assert.ok(sp.length > 0 && sp.length < all.length);
  assert.ok(sp.every((r) => { const u = ufFromUrl(r.url); return u === null || u === "SP"; }));
});

test("'Comarca de' na matrícula não torna o leilão judicial; comitente sem texto extra", () => {
  const l = lot("lote-boxed-desocupado", 42234);
  assert.equal(l.auctionType, "EXTRAJUDICIAL");
  assert.ok(!/Ciência/.test(l.seller ?? ""));
});
