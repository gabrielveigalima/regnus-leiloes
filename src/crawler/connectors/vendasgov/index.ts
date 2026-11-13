import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { PAGE_SIZE, detailApiUrl, listUrl, parseDetail, parseList, portalUrl, type VgDetail } from "./parser";

/**
 * VendasGov – Imóveis da União (SPU, INSS e outros; Serpro). API JSON pública que o próprio portal usa.
 * A listagem (`/direct/imoveis`) só traz ids e não filtra por situação; o que está à venda é decidido pela "sala" do
 * detalhe (`/public/imoveis/{id}`). São ~2.800 ids → ~2.800 requisições por coleta completa (use `--concurrency` no PC).
 */
export const vendasgov: Connector = {
  id: "vendasgov",

  async *discover(ctx) {
    for (let page = 0; ; page++) {
      const list = parseList((await ctx.http.get(listUrl(page))).body);
      if (page === 0) ctx.log(`vendasgov: ${list.totalElements} imóveis em ${list.totalPages} páginas`);
      for (const id of list.content) yield { externalId: String(id), url: portalUrl(id) } satisfies ListingRef;
      if (page + 1 >= list.totalPages || list.content.length < PAGE_SIZE) break;
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    return { ref, body: JSON.parse((await ctx.http.get(detailApiUrl(ref.externalId))).body) as VgDetail };
  },

  parse(raw) {
    return parseDetail(raw.body as VgDetail);
  },
};
