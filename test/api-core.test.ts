import test from "node:test";
import assert from "node:assert/strict";
import { generateApiKey, parseApiKey, verifySecret, extractKey } from "../src/lib/api-keys";
import { FixedWindowLimiter } from "../src/lib/rate-limit";
import { csvCell, csvDocument, csvRow, dec } from "../src/lib/csv";
import { parseFilters, buildWhere } from "../src/lib/search";

test("chave: formato, prefixo visível e verificação do hash", () => {
  const k = generateApiKey();
  const p = parseApiKey(k.key)!;
  assert.ok(p);
  assert.equal(p.prefix, k.prefix);
  assert.ok(verifySecret(p.secret, k.hash));
  assert.ok(!verifySecret(p.secret + "x", k.hash));
  assert.ok(!k.hash.includes(p.secret));
  assert.notEqual(generateApiKey().key, k.key);
});
test("parse rejeita formatos inválidos; extractKey lê Bearer e X-API-Key", () => {
  for (const bad of [null, "", "rl_short_x", "xx_abcdefgh_" + "a".repeat(43), "rl_abcdefgh_" + "a".repeat(10)]) assert.equal(parseApiKey(bad), null);
  assert.equal(extractKey(new Headers({ authorization: "Bearer abc" })), "abc");
  assert.equal(extractKey(new Headers({ "x-api-key": "k1" })), "k1");
  assert.equal(extractKey(new Headers()), null);
});
test("rate limit por chave em janela fixa", () => {
  let t = 0;
  const rl = new FixedWindowLimiter(3, 1000, () => t);
  assert.deepEqual([1, 2, 3, 4].map(() => rl.hit("a").allowed), [true, true, true, false]);
  assert.equal(rl.hit("b").allowed, true); // outra chave
  assert.equal(rl.hit("a").remaining, 0);
  t = 1000;
  assert.equal(rl.hit("a").allowed, true);
});
test("CSV: aspas, separador, quebras e injeção de fórmula", () => {
  assert.equal(csvCell('a;b'), '"a;b"');
  assert.equal(csvCell('diz "oi"'), '"diz ""oi"""');
  assert.equal(csvCell("=HYPERLINK(\"x\")"), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("-5"), "-5"); // número negativo legítimo
  assert.equal(csvCell("-cmd|calc"), "'-cmd|calc");
  assert.equal(csvCell(null), "");
  assert.equal(csvRow(["a", 1, null]), "a;1;");
  assert.ok(csvDocument([["x"]]).startsWith("﻿"));
  assert.equal(dec(1234.5), "1234,50");
  assert.equal(dec(null), "");
});
test("plano com UFs: restringe a consulta e bloqueia UF fora do plano", () => {
  const f = parseFilters({});
  assert.deepEqual(buildWhere(f, { allowedUfs: ["SP", "RJ"] }).property, { uf: { in: ["SP", "RJ"] } });
  assert.deepEqual(buildWhere(parseFilters({ uf: "sp" }), { allowedUfs: ["SP"] }).property, { uf: "SP" });
  assert.deepEqual(buildWhere(parseFilters({ uf: "MG" }), { allowedUfs: ["SP"] }).property, { uf: "__none__" });
  assert.equal(buildWhere(f, { allowedUfs: null }).property, undefined);
});
