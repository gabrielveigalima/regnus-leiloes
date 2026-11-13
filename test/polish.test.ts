import test from "node:test";
import assert from "node:assert/strict";
import { fmtDaysUntil, fmtPricePerM2, pricePerM2 } from "../src/lib/format";
import { unsubscribeUrl, verifyUnsubscribe } from "../src/lib/unsub";
import { buildAlertEmail } from "../src/lib/alert-email";
import { ManualBillingProvider } from "../src/lib/billing";

test("preço por m²: usa privativa > total > terreno; sem área ou preço = null", () => {
  assert.equal(pricePerM2(100000, { privateArea: 50 }), 2000);
  assert.equal(pricePerM2("90000", { privateArea: 0, totalArea: 60 }), 1500);
  assert.equal(pricePerM2(50000, { landArea: "250.00" }), 200);
  assert.equal(pricePerM2(null, { privateArea: 50 }), null);
  assert.equal(pricePerM2(100000, { privateArea: null }), null);
  assert.match(fmtPricePerM2(2000), /R\$\s2\.000,00\/m²/);
  assert.equal(fmtPricePerM2(null), "—");
});

test("dias até a praça usa o dia civil de Brasília", () => {
  const now = new Date("2026-11-12T23:30:00-03:00");
  assert.equal(fmtDaysUntil(new Date("2026-11-12T08:00:00-03:00"), now), "hoje"); // mais cedo no mesmo dia
  assert.equal(fmtDaysUntil(new Date("2026-11-13T01:00:00-03:00"), now), "amanhã"); // 01h local, 02h30 depois
  assert.equal(fmtDaysUntil(new Date("2026-11-20T10:00:00-03:00"), now), "em 8 dias");
  assert.equal(fmtDaysUntil(new Date("2026-11-11T10:00:00-03:00"), now), null);
  assert.equal(fmtDaysUntil(null, now), null);
  // 23h de Brasília = 02h UTC do dia seguinte: continua "hoje" para quem está no Brasil
  assert.equal(fmtDaysUntil(new Date("2026-11-13T02:00:00Z"), now), "hoje");
});

test("descadastro: link assinado, adulteração e id trocado são rejeitados", () => {
  process.env.NEXTAUTH_SECRET = "segredo-de-teste-com-tamanho-suficiente";
  const url = new URL(unsubscribeUrl("https://app", "abc123"));
  const id = url.searchParams.get("id")!, sig = url.searchParams.get("sig")!;
  assert.equal(url.origin + url.pathname, "https://app/alertas/cancelar");
  assert.equal(verifyUnsubscribe(id, sig), true);
  assert.equal(verifyUnsubscribe("outro", sig), false);
  assert.equal(verifyUnsubscribe(id, sig.slice(0, -2) + "xx"), false);
  assert.equal(verifyUnsubscribe(id, undefined), false);
  assert.equal(verifyUnsubscribe(undefined, sig), false);
  process.env.NEXTAUTH_SECRET = "outro-segredo-completamente-diferente";
  assert.equal(verifyUnsubscribe(id, sig), false, "assinatura de outro segredo não vale");
});

test("e-mail de alerta inclui o link de descadastro (texto e HTML)", () => {
  const item = { id: "1", propertyId: "p", title: "Casa", city: "X", uf: "SP", minBid: 1, discountPct: null, url: "https://o", sourceName: "S", kind: "NEW" as const };
  const e = buildAlertEmail({ searchName: "n", items: [item], total: 1, appUrl: "https://app", unsubscribeUrl: "https://app/alertas/cancelar?id=1&sig=a" });
  assert.match(e.text, /Parar de receber este alerta: https:\/\/app\/alertas\/cancelar\?id=1&sig=a/);
  assert.match(e.html, /Parar de receber este alerta/);
  assert.ok(!buildAlertEmail({ searchName: "n", items: [item], total: 1, appUrl: "https://app" }).text.includes("Parar de receber"));
});

test("BillingProvider manual: não cobra, ignora webhooks e orienta o cancelamento", async () => {
  const b = new ManualBillingProvider();
  assert.equal(b.name, "manual");
  assert.equal(await b.parseWebhook(), null);
  assert.equal((await b.cancel()).ok, false);
});
