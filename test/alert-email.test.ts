import test from "node:test";
import assert from "node:assert/strict";
import { buildAlertEmail, type AlertItem } from "../src/lib/alert-email";

const item = (o: Partial<AlertItem> = {}): AlertItem => ({
  id: "1", propertyId: "p1", title: "Casa <b>x</b>", city: "Campinas", uf: "SP", minBid: 150000, discountPct: 40.4,
  url: "https://orig/1", sourceName: "Caixa", kind: "NEW", ...o,
});

test("assunto resume novos e quedas", () => {
  const e = buildAlertEmail({ searchName: "SP baratos", items: [item(), item({ id: "2", kind: "PRICE_DROP", oldBid: 200000 }), item({ id: "3" })], total: 3, appUrl: "https://app" });
  assert.equal(e.subject, "Regnus Leilões: 2 novos e 1 com queda de preço — SP baratos");
  assert.match(e.text, /antes R\$\s200\.000,00/);
  assert.match(e.text, /https:\/\/app\/imovel\/p1/);
});
test("escapa HTML e indica itens omitidos", () => {
  const e = buildAlertEmail({ searchName: "<script>", items: [item()], total: 30, appUrl: "https://app" });
  assert.ok(!e.html.includes("<script>"));
  assert.ok(!e.html.includes("<b>x</b>"));
  assert.match(e.text, /mais 29/);
});
