import test from "node:test";
import assert from "node:assert/strict";
import { parseFilters, buildWhere, buildOrderBy } from "../src/lib/search";

test("filtros vazios: só OPEN/UPCOMING, ordem por desconto", () => {
  const f = parseFilters({});
  assert.equal(f.ordem, "desconto");
  assert.deepEqual(buildWhere(f), { status: { in: ["OPEN", "UPCOMING"] } });
});

test("combina filtros de imóvel e anúncio", () => {
  const f = parseFilters({ uf: "sp", cidade: "Campinas", tipo: "HOUSE,APARTMENT", precoMin: "100000", precoMax: "300000,5", descMin: "30", quartos: "2", financia: "1" });
  const w = buildWhere(f);
  assert.deepEqual(w.property, { uf: "SP", city: { contains: "Campinas" }, type: { in: ["HOUSE", "APARTMENT"] }, bedrooms: { gte: 2 } });
  assert.deepEqual(w.minBid, { gte: 100000, lte: 300000.5 });
  assert.deepEqual(w.discountPct, { gte: 30 });
  assert.equal(w.acceptsFinancing, true);
});

test("valores inválidos são ignorados (sem lançar)", () => {
  const f = parseFilters({ ordem: "xyz", ocupacao: "foo", precoMin: "", pracaAte: "ontem" });
  assert.equal(f.ordem, "desconto");
  assert.equal(f.ocupacao, undefined);
  assert.equal(f.precoMin, undefined);
  assert.equal(f.pracaAte, undefined);
});

test("busca livre procura em título, descrição, rua e bairro", () => {
  const w = buildWhere(parseFilters({ q: "centro" }));
  assert.equal((w.AND as unknown[]).length, 1);
});

test("praça até usa fim do dia em Brasília", () => {
  const f = parseFilters({ pracaAte: "2026-12-01" });
  assert.equal(f.pracaAte?.toISOString(), "2026-12-02T02:59:59.000Z");
});

test("ordenações sempre têm desempate por id", () => {
  for (const o of ["desconto", "preco", "praca", "recentes"] as const) assert.deepEqual(buildOrderBy(o).at(-1), { id: "asc" });
});
