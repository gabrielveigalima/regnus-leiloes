import test from "node:test";
import assert from "node:assert/strict";
import { scorePair, trigramSimilarity, fingerprint, normComplement, registryKey, type PropLike } from "../src/lib/dedup";

const P = (o: Partial<PropLike> = {}): PropLike => ({
  type: "APARTMENT", street: "RUA DAS FLORES", number: "100", complement: "Apto 52", city: "Campinas", uf: "SP", zip: null,
  registry: null, registryOffice: null, privateArea: 60 as never, totalArea: null, landArea: null, ...o,
});

test("normalizações", () => {
  assert.equal(registryKey("00.123-4"), "1234");
  assert.equal(registryKey(null), null);
  assert.equal(normComplement("Apto 03, BL 4"), normComplement("Apartamento 3 Bloco 4"));
  assert.equal(trigramSimilarity("rua das flores", "rua das flores"), 1);
  assert.ok(trigramSimilarity("flores", "florestan") < 0.8);
});
test("fingerprint exige CEP e número e ignora formatação", () => {
  assert.equal(fingerprint({ zip: null, number: "1", complement: null }), null);
  assert.equal(fingerprint({ zip: "13000-000".replace("-", ""), number: "100", complement: "Apto 52" }), fingerprint({ zip: "13000000", number: "0100", complement: "apartamento 52" }));
});

test("(a) matrícula: mesma matrícula e ofício funde; ofício diferente descarta; ofício ausente vira candidato", () => {
  const base = { registry: "12345", registryOffice: "Ofício 01 - CAMPINAS-SP" };
  assert.deepEqual(scorePair(P(base), P({ ...base, street: "OUTRA", number: "9" }))?.auto, true);
  assert.equal(scorePair(P(base), P({ registry: "012345", registryOffice: "1º Ofício de Registro de Imóveis" }))?.auto, true);
  assert.equal(scorePair(P(base), P({ registry: "12345", registryOffice: "Ofício 02" })), null);
  const weak = scorePair(P(base), P({ registry: "12345" }));
  assert.equal(weak?.auto, false);
  assert.equal(weak?.score, 0.85);
  assert.equal(scorePair(P(base), P({ ...base, city: "Sorocaba" })), null); // outra cidade
});

test("(b) CEP + número + complemento", () => {
  const a = P({ zip: "13010000" }), b = P({ zip: "13010000", street: "R FLORES (grafia diferente)", complement: "AP 52" });
  const r = scorePair(a, b);
  assert.equal(r?.auto, true);
  assert.equal(scorePair(P({ zip: "13010000" }), P({ zip: "13010000", complement: "Apto 53" })), null); // outra unidade do prédio
});

test("(c) endereço similar: funde só com área compatível; sem área vira candidato", () => {
  const a = P(), b = P({ street: "R DAS FLORES", privateArea: 61 as never });
  const ok = scorePair(a, b);
  assert.equal(ok?.auto, true);
  const noArea = scorePair(P({ privateArea: null }), P({ street: "R DAS FLORES", privateArea: null }));
  assert.equal(noArea?.auto, false);
  assert.ok(noArea && noArea.score >= 0.75);
});
test("(c) rejeita: área > 5% diferente, número diferente, complementos diferentes, tipo diferente, rua diferente", () => {
  assert.equal(scorePair(P(), P({ privateArea: 70 as never })), null);
  assert.equal(scorePair(P(), P({ number: "101" })), null);
  assert.equal(scorePair(P(), P({ complement: "Apto 99" })), null);
  assert.equal(scorePair(P(), P({ type: "HOUSE" })), null);
  assert.equal(scorePair(P(), P({ street: "AVENIDA BRASIL" })), null);
});
test("complemento ausente em um lado nunca funde automaticamente", () => {
  const r = scorePair(P(), P({ complement: null }));
  assert.ok(r === null || r.auto === false);
});
test("tipo OTHER é compatível com qualquer tipo", () => {
  assert.ok(scorePair(P(), P({ type: "OTHER" })));
});
