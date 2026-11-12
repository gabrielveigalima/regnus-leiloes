import test from "node:test";
import assert from "node:assert/strict";
import { parseBRL, discountPct, parseBRDateTime, parseAreaM2, parsePropertyType, normalizeUf, normalizeZip, titleCaseCity } from "../src/lib/normalize";

test("parseBRL", () => {
  assert.equal(parseBRL("R$ 1.234.567,89"), 1234567.89);
  assert.equal(parseBRL("R$ 450,00"), 450);
  assert.equal(parseBRL("1.500"), 1500);
  assert.equal(parseBRL("abc"), null);
  assert.equal(parseBRL(null), null);
});
test("discountPct", () => {
  assert.equal(discountPct(200000, 100000), 50);
  assert.equal(discountPct(null, 10), null);
});
test("parseBRDateTime usa UTC-3", () => {
  assert.equal(parseBRDateTime("15/03/2026 14:30")?.toISOString(), "2026-03-15T17:30:00.000Z");
  assert.equal(parseBRDateTime("31/02/2026"), null);
  assert.equal(parseBRDateTime(""), null);
});
test("parseAreaM2", () => {
  assert.equal(parseAreaM2("85,5 m²"), 85.5);
  assert.equal(parseAreaM2("2 ha"), 20000);
  assert.equal(parseAreaM2("1.200,00 m2"), 1200);
});
test("parsePropertyType", () => {
  assert.equal(parsePropertyType("Apartamento 2 quartos"), "APARTMENT");
  assert.equal(parsePropertyType("Casa térrea"), "HOUSE");
  assert.equal(parsePropertyType("Terreno urbano"), "LAND");
  assert.equal(parsePropertyType("Sala comercial"), "COMMERCIAL");
  assert.equal(parsePropertyType("Sítio"), "RURAL");
  assert.equal(parsePropertyType("xyz"), "OTHER");
});
test("endereço", () => {
  assert.equal(normalizeUf("sp"), "SP");
  assert.equal(normalizeUf("XX"), null);
  assert.equal(normalizeZip("01310-100"), "01310100");
  assert.equal(titleCaseCity("SÃO JOSÉ DOS CAMPOS"), "São José dos Campos");
});
