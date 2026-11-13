import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseListPage, cardToListing, enrichWithDetail } from "../src/crawler/connectors/freitas/parser";

const fx = (n: string) => readFileSync(new URL(`./fixtures/freitas/${n}`, import.meta.url), "utf8");

test("lista: 12 cards na página cheia, 3 na última e 0 na vazia", () => {
    assert.equal(parseListPage(fx("lista-p1.html")).length, 12);
    assert.equal(parseListPage(fx("lista-ultima.html")).length, 3);
    assert.equal(parseListPage(fx("lista-vazia.html")).length, 0);
  });

test("card básico", () => {
    const c = parseListPage(fx("lista-p1.html"))[0]!;
    const l = cardToListing(c);
    assert.equal(l.externalId, "8157-1");
    assert.equal(l.status, "OPEN");
    assert.equal(l.minBid, 543000);
    assert.equal(l.property.uf, "GO");
  });

test("detalhe: endereço, vendedor, edital e matrícula", () => {
    const c = parseListPage(fx("lista-p1.html"))[0]!;
    const l = enrichWithDetail(cardToListing(c), fx("lote-bradesco-online.html"));
    assert.equal(l.detail, true);
    assert.equal(l.seller, "BANCO BRADESCO S/A");
    assert.ok(l.property.street?.includes("Rua 04"));
    assert.equal(l.property.registry, "42.791");
    assert.equal(l.property.city, "Rio Verde");
    assert.match(l.noticeUrl ?? "", /edital_8157\.pdf$/);
    assert.equal(l.title, "Casa em Rio Verde/GO (lote 1)");
  });

test("detalhe de leilão particular não tem vendedor bancário", () => {
    const base = cardToListing({ leilaoId: "8182", lote: "1", date: "16/11/2026", time: "09:30", desc: "Guarulhos-SP", price: null, city: "GUARULHOS", uf: "SP", status: "ABERTO PARA LANCES", image: null });
    const l = enrichWithDetail(base, fx("lote-galpao-particular.html"));
    assert.equal(l.seller, null);
    assert.equal(l.property.type, "COMMERCIAL");
    assert.equal(l.property.uf, "SP");
  });
