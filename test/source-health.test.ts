import test from "node:test";
import assert from "node:assert/strict";
import { computeHealth, volumeDrop, type HealthRun, type HealthInput } from "../src/lib/source-health";

const now = new Date("2026-11-12T12:00:00Z");
const run = (o: Partial<HealthRun> = {}): HealthRun => ({ status: "SUCCESS", seen: 1000, errors: 0, isFull: true, startedAt: now, ...o });
const base = (o: Partial<HealthInput> = {}): HealthInput => ({
  active: true, hasConnector: true, blockedByRobots: false, intervalMinutes: 720, lastSuccessAt: new Date(now.getTime() - 3600_000), runs: [run(), run()], now, ...o,
});

test("saudável", () => assert.equal(computeHealth(base()), "OK"));
test("sem conector / bloqueada / desativada têm prioridade", () => {
  assert.equal(computeHealth(base({ hasConnector: false })), "NO_CONNECTOR");
  assert.equal(computeHealth(base({ blockedByRobots: true })), "BLOCKED");
  assert.equal(computeHealth(base({ active: false })), "INACTIVE");
});
test("nunca coletou", () => assert.equal(computeHealth(base({ runs: [], lastSuccessAt: null })), "NEVER"));
test("falha na última execução ou taxa de erro alta", () => {
  assert.equal(computeHealth(base({ runs: [run({ status: "FAILED" })] })), "FAILING");
  assert.equal(computeHealth(base({ runs: [run({ status: "PARTIAL", seen: 70, errors: 30 })] })), "FAILING");
  assert.equal(computeHealth(base({ runs: [run({ status: "PARTIAL", seen: 990, errors: 10 }), run()] })), "OK");
});
test("queda de volume > 50% entre coletas completas", () => {
  const runs = [run({ seen: 400 }), run({ seen: 1000 })];
  assert.equal(computeHealth(base({ runs })), "VOLUME_DROP");
  assert.deepEqual(volumeDrop(runs), { dropped: true, previous: 1000, current: 400 });
  assert.equal(volumeDrop([run({ seen: 600 }), run({ seen: 1000 })]).dropped, false);
});
test("coletas parciais (--limit) não contam para queda de volume", () => {
  assert.equal(volumeDrop([run({ seen: 20, isFull: false }), run({ seen: 1000 })]).dropped, false);
});
test("desatualizada após 2x o intervalo", () => {
  assert.equal(computeHealth(base({ lastSuccessAt: new Date(now.getTime() - 25 * 3600_000) })), "STALE");
});
