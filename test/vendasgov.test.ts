import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classify, latestCertame, parseDetail, parseList, type VgDetail } from "../src/crawler/connectors/vendasgov/parser";
import { vendasgov } from "../src/crawler/connectors/vendasgov";
import type { CrawlContext } from "../src/crawler/core/connector";

const fx = (n: string) => readFileSync(new URL(`./fixtures/vendasgov/${n}`, import.meta.url), "utf8");
const det = (n: string) => JSON.parse(fx(n)) as VgDetail;
const NOW = new Date("2026-11-13T00:00:00-03:00");

test("lista: 100 ids por página, total de 2.826 imóveis em 29 páginas", () => {
  const p = parseList(fx("lista-p1.json"));
  assert.equal(p.content.length, 100);
  assert.equal(p.totalElements, 2826);
  assert.equal(p.totalPages, 29);
  assert.equal(parseList(fx("lista-ultima.json")).content.length, 26); // 2826 - 28 * 100
});

test("fora de venda: em processo, vendido e concorrência com edital antigo", () => {
  assert.equal(parseDetail(det("imovel-em-processo.json"), NOW), null);
  assert.equal(parseDetail(det("imovel-vendido.json"), NOW), null);
  assert.equal(parseDetail(det("imovel-concorrencia-antiga.json"), NOW), null);
});

test("autorizado (certame deserto): UPCOMING, valor de reserva do edital, matrícula, coordenadas e fotos", () => {
  const l = parseDetail(det("imovel-autorizado-sala.json"), NOW)!;
  assert.ok(l);
  assert.equal(l.externalId, "456");
  assert.equal(l.status, "UPCOMING");
  assert.equal(l.auctionType, "LICITACAO_ABERTA");
  assert.equal(l.minBid, 266250);
  assert.equal(l.property.type, "COMMERCIAL");
  assert.equal(l.property.city, "Porto Alegre");
  assert.equal(l.property.uf, "RS");
  assert.equal(l.property.registry, "18430");
  assert.equal(l.property.geoPrecision, "SOURCE");
  assert.equal(l.seller, "Secretaria do Patrimônio da União");
  assert.equal(l.images.length, 10);
  assert.ok(l.images[0]!.startsWith("https://imoveis.vendasgov.serpro.gov.br/api/public/imoveis/"));
  assert.match(l.noticeUrl ?? "", /^https:\/\/imoveis\.vendasgov\.serpro\.gov\.br\/api\/public\/editais\//);
  assert.equal(l.url, "https://imoveis.vendasgov.serpro.gov.br/imovel/456");
});

test("endereço: logradouro sem 'CEP', número e CEP separados; áreas", () => {
  const l = parseDetail(det("imovel-autorizado-deserto.json"), NOW)!;
  assert.ok(!/CEP/i.test(l.property.street ?? ""));
  assert.ok(l.property.privateArea == null || l.property.privateArea > 0);
  assert.equal(l.property.type, "LAND");
});

test("classificação por sala: venda direta aberta; concorrência futura = UPCOMING com a data; recente = OPEN", () => {
  const base = det("imovel-concorrencia-antiga.json");
  const withCertame = (iso: string): VgDetail => ({ ...base, itens: [{ ...base.itens![0]!, edital: { ...base.itens![0]!.edital!, dtCertame: iso } }] });
  assert.deepEqual(classify({ ...base, sala: { subtipo: "venda" } }, NOW)?.status, "OPEN");
  assert.equal(classify({ ...base, sala: { subtipo: "venda" } }, NOW)?.auctionType, "DIRECT_SALE");
  const fut = classify(withCertame("2026-12-10T15:00:00"), NOW)!;
  assert.equal(fut.status, "UPCOMING");
  assert.equal(fut.nextDate?.toISOString(), "2026-12-10T18:00:00.000Z");
  assert.equal(classify(withCertame("2026-11-01T15:00:00"), NOW)?.status, "OPEN"); // há 12 dias
  assert.equal(classify(withCertame("2026-08-01T15:00:00"), NOW), null); // velho demais
  for (const sala of ["emProcesso", "vendido", "pai", "fundo", ""]) assert.equal(classify({ ...base, sala: { subtipo: sala } }, NOW), null, sala);
  assert.equal(latestCertame({ ...base, itens: [] }).date, null);
});

test("discover: pagina a lista até a última página; fetchDetail lê o JSON do imóvel", async () => {
  const urls: string[] = [];
  const http = { get: async (u: string) => { urls.push(u); return { status: 200, notModified: false, body: u.includes("page=28") ? fx("lista-ultima.json") : fx("lista-p1.json") }; } };
  const ctx = { http, filters: {}, log: () => {} } as unknown as CrawlContext;
  const refs = []; for await (const r of vendasgov.discover(ctx)) refs.push(r);
  assert.equal(urls.length, 29);
  assert.equal(refs.length, 28 * 100 + 26);
  assert.equal(vendasgov.id, "vendasgov");
  const raw = await vendasgov.fetchDetail!(refs[0]!, { http: { get: async () => ({ status: 200, notModified: false, body: fx("imovel-autorizado-sala.json") }) } } as unknown as CrawlContext);
  assert.equal(vendasgov.parse(raw)?.externalId, "456");
});
