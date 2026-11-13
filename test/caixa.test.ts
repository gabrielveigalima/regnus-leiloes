import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCaixaCsv, rowToListing, enrichWithDetail, splitAddress } from "../src/crawler/connectors/caixa/parser";
import { caixa } from "../src/crawler/connectors/caixa";

const fx = (n: string, enc: "latin1" | "utf8" = "utf8") => readFileSync(new URL(`./fixtures/caixa/${n}`, import.meta.url), enc);
const rows = parseCaixaCsv(fx("Lista_imoveis_SP.csv", "latin1"));
const byId = (id: string) => rowToListing(rows.find((r) => r.id === id)!);

test("CSV: ignora cabeçalhos e lê todas as linhas", () => {
  assert.equal(rows.length, 14);
  assert.ok(rows.every((r) => /^\d+$/.test(r.id)));
});

test("CSV: venda direta com valores, desconto e financiamento", () => {
  const l = byId("1444421729441");
  assert.equal(l.minBid, 136584.86);
  assert.equal(l.appraisalValue, 217000);
  assert.equal(l.auctionType, "DIRECT_SALE");
  assert.equal(l.property.type, "HOUSE");
  assert.equal(l.property.city, "Adamantina");
  assert.equal(l.property.uf, "SP");
  assert.equal(l.property.street, "RUA JOSE DE OLIVEIRA JUNIOR");
  assert.equal(l.property.number, "670");
  assert.equal(l.property.complement, "LT 09 QD O");
  assert.equal(l.property.privateArea, 116.12);
  assert.equal(l.property.landArea, 224.29);
  assert.equal(l.property.bedrooms, 2);
  assert.equal(l.acceptsFinancing, false);
  assert.equal(byId("1444408501866").acceptsFinancing, true);
  assert.equal(byId("1444408501866").property.totalArea, null); // 0.00 vira null
});

test("CSV: modalidades e tipos", () => {
  assert.equal(byId("8555539791353").auctionType, "EXTRAJUDICIAL");
  assert.equal(byId("8555539791353").property.type, "APARTMENT");
  assert.equal(byId("8444426889550").auctionType, "LICITACAO_ABERTA");
  assert.equal(byId("10148874").property.type, "LAND");
  assert.equal(byId("10006343").property.type, "RURAL");
});

test("splitAddress", () => {
  assert.deepEqual(splitAddress("AV X, N. S/N, QD 1"), { street: "AV X", number: null, complement: "QD 1" });
  assert.equal(splitAddress("RUA SEM NUMERO").number, null);
});

test("detalhe venda direta: matrícula, CEP, FGTS, foto", () => {
  const l = enrichWithDetail(byId("1444421729441"), fx("detalhe-venda-direta.html"));
  assert.equal(l.property.registry, "24726");
  assert.equal(l.property.zip, "17808456");
  assert.equal(l.property.registryOffice, "Ofício 01 - ADAMANTINA-SP");
  assert.equal(l.acceptsFgts, true);
  assert.deepEqual(l.images, ["https://venda-imoveis.caixa.gov.br/fotos/F144442172944121.jpg"]);
});

test("detalhe leilão SFI: duas praças com data, valor e edital", () => {
  const l = enrichWithDetail(byId("10148874"), fx("detalhe-10148874.html"));
  assert.equal(l.rounds.length, 2);
  assert.equal(l.rounds[0]!.minBid, 1186000);
  assert.equal(l.rounds[1]!.minBid, 2198105.29);
  assert.equal(l.rounds[0]!.date?.toISOString(), "2026-12-01T13:00:00.000Z");
  assert.equal(l.rounds[1]!.date?.toISOString(), "2026-12-07T13:00:00.000Z");
  assert.equal(l.noticeUrl, "https://venda-imoveis.caixa.gov.br/editais/EL00530226CPARE.PDF");
  assert.equal(l.property.registry, "34858");
});

test("connector.parse aceita linha crua", () => {
  const ref = { externalId: "1", url: "https://x.com" };
  const l = caixa.parse({ ref, body: rows[0] });
  assert.equal(l.externalId, rows[0]!.id);
});

test("flag detail: só a página de detalhe marca o anúncio como completo", () => {
  const base = byId("10148874");
  assert.equal(base.detail, false);
  assert.equal(enrichWithDetail(base, fx("detalhe-10148874.html")).detail, true);
});
