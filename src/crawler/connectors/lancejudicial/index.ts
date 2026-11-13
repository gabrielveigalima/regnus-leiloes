import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { cardToListing, enrichWithDetail, listUrl, parseListPage, type LanceCard } from "./parser";

/** A página do lote (1 req/lote) traz praças, valor de avaliação, endereço, coordenadas e edital. LANCE_DETAIL=0 = só o card. */
const useDetail = () => process.env.LANCE_DETAIL !== "0";

/** Grupo Lance (Lance Judicial). Listagem `/imoveis?pagina=N` renderizada no servidor (32 por página). Inclui lotes da PGFN (Comprei). */
export const lancejudicial: Connector = {
  id: "lancejudicial",

  async *discover(ctx) {
    const first = parseListPage((await ctx.http.get(listUrl(1))).body);
    ctx.log(`lancejudicial: ${first.total} lotes em ${first.pages} páginas`);
    for (let page = 1; page <= first.pages; page++) {
      const { cards } = page === 1 ? first : parseListPage((await ctx.http.get(listUrl(page))).body);
      if (cards.length === 0) break;
      for (const card of cards) {
        if (ctx.filters.uf && !card.locality?.endsWith(`, ${ctx.filters.uf}`)) continue;
        yield { externalId: card.id, url: card.url, data: card } satisfies ListingRef;
      }
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    if (!useDetail()) return { ref, body: ref.data };
    return { ref, body: { card: ref.data, html: (await ctx.http.get(ref.url)).body } };
  },

  parse(raw) {
    const b = raw.body as LanceCard | { card: LanceCard; html: string };
    if ("html" in b) return enrichWithDetail(cardToListing(b.card), b.html);
    return cardToListing(b);
  },
};
