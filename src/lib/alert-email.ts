import { fmtBRL } from "./format";

export interface AlertItem {
  id: string; propertyId: string | null; title: string; city: string | null; uf: string | null;
  minBid: number | null; discountPct: number | null; url: string; sourceName: string;
  kind: "NEW" | "PRICE_DROP"; oldBid?: number | null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildAlertEmail(opts: { searchName: string; items: AlertItem[]; total: number; appUrl: string; unsubscribeUrl?: string }) {
  const { searchName, items, total, appUrl, unsubscribeUrl } = opts;
  const novos = items.filter((i) => i.kind === "NEW").length;
  const quedas = items.length - novos;
  const parts = [novos && `${novos} novo${novos > 1 ? "s" : ""}`, quedas && `${quedas} com queda de preço`].filter(Boolean).join(" e ");
  const subject = `Regnus Leilões: ${parts} — ${searchName}`;
  const link = (i: AlertItem) => (i.propertyId ? `${appUrl}/imovel/${i.propertyId}` : i.url);
  const line = (i: AlertItem) =>
    `${i.kind === "NEW" ? "NOVO" : "PREÇO ↓"} · ${i.title} (${[i.city, i.uf].filter(Boolean).join("/")}) · ${fmtBRL(i.minBid)}` +
    `${i.kind === "PRICE_DROP" && i.oldBid != null ? ` (antes ${fmtBRL(i.oldBid)})` : ""}` +
    `${i.discountPct != null && i.discountPct > 0 ? ` · -${i.discountPct.toFixed(0)}%` : ""} · ${i.sourceName}`;
  const more = total > items.length ? `\n… e mais ${total - items.length}. Veja todos no sistema.` : "";

  const text = `Sua busca salva "${searchName}" tem novidades:\n\n${items.map((i) => `${line(i)}\n${link(i)}`).join("\n\n")}${more}\n\nGerenciar alertas: ${appUrl}/alertas\n${unsubscribeUrl ? `Parar de receber este alerta: ${unsubscribeUrl}\n` : ""}`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:640px"><h2>Busca salva: ${esc(searchName)}</h2><ul style="padding-left:18px">${items
    .map((i) => `<li style="margin-bottom:10px"><a href="${esc(link(i))}">${esc(line(i))}</a></li>`).join("")}</ul>${
    total > items.length ? `<p>… e mais ${total - items.length}. <a href="${esc(appUrl)}/busca">Ver todos no sistema</a></p>` : ""
  }<p style="color:#667085;font-size:12px"><a href="${esc(appUrl)}/alertas">Gerenciar alertas</a>${unsubscribeUrl ? ` · <a href="${esc(unsubscribeUrl)}">Parar de receber este alerta</a>` : ""}</p></div>`;
  return { subject, text, html };
}
