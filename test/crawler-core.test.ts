import test from "node:test";
import assert from "node:assert/strict";
import { parseRobots, isAllowed } from "../src/crawler/core/robots";
import { DomainRateLimiter } from "../src/crawler/core/rate-limit";
import { NormalizedListingSchema } from "../src/crawler/core/connector";

test("robots: respeita Disallow e Allow mais específico", () => {
  const r = parseRobots("User-agent: *\nDisallow: /privado\nAllow: /privado/publico\n", "RegnusBot/1.0");
  assert.equal(isAllowed(r, "/imoveis"), true);
  assert.equal(isAllowed(r, "/privado/x"), false);
  assert.equal(isAllowed(r, "/privado/publico/a"), true);
});
test("robots: grupo específico do bot prevalece", () => {
  const r = parseRobots("User-agent: *\nAllow: /\n\nUser-agent: RegnusBot\nDisallow: /\n", "RegnusBot/1.0");
  assert.equal(isAllowed(r, "/qualquer"), false);
});
test("rate limiter espaça requisições do mesmo host", async () => {
  let t = 0; const waits: number[] = [];
  const rl = new DomainRateLimiter(1000, () => t, async (ms) => { waits.push(ms); t += ms; });
  await rl.wait("a"); await rl.wait("a"); await rl.wait("b");
  assert.deepEqual(waits, [1000]);
});
test("schema de listing valida e aplica defaults", () => {
  const ok = NormalizedListingSchema.parse({ externalId: "1", url: "https://x.com/1", title: "Casa", property: {} });
  assert.equal(ok.status, "OPEN");
  assert.throws(() => NormalizedListingSchema.parse({ externalId: "", url: "x", title: "", property: {} }));
});
