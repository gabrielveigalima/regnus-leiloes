import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { CAIXA_BASE, csvUrl, detailUrl, enrichWithDetail, parseCaixaCsv, rowToListing, type CaixaRow } from "./parser";

export const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

/** Página de detalhe = 1 requisição por imóvel (~1 req/s). Desligada por padrão; ligue com CAIXA_DETAIL=1. */
const useDetail = () => process.env.CAIXA_DETAIL === "1";

export const caixa: Connector = {
  id: "caixa",

  async *discover(ctx) {
    const ufs = ctx.filters.uf ? [ctx.filters.uf] : UFS;
    for (const uf of ufs) {
      const text = (await ctx.http.get(csvUrl(uf), {}, "iso-8859-1")).body;
      const rows = parseCaixaCsv(text);
      ctx.log(`caixa ${uf}: ${rows.length} imóveis`);
      for (const row of rows) yield { externalId: row.id, url: row.link || detailUrl(row.id), data: row } satisfies ListingRef;
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    if (!useDetail()) return { ref, body: ref.data };
    const res = await ctx.http.get(detailUrl(ref.externalId));
    return { ref, body: { row: ref.data, html: res.body } };
  },

  parse(raw) {
    const b = raw.body as CaixaRow | { row: CaixaRow; html: string };
    if ("html" in b) return enrichWithDetail(rowToListing(b.row), b.html);
    return rowToListing(b);
  },
};

export { CAIXA_BASE };
