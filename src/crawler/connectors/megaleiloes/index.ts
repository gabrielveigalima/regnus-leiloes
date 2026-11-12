import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { cardToListing, enrichWithDetail, listUrl, parseListPage, type MegaCard } from "./parser";

/** Página do lote = 1 requisição por imóvel. Desligada por padrão; ligue com MEGA_DETAIL=1. */
const useDetail = () => process.env.MEGA_DETAIL === "1";

export const megaleiloes: Connector = {
  id: "megaleiloes",

  async *discover(ctx) {
    const first = parseListPage((await ctx.http.get(listUrl(1))).body);
    ctx.log(`megaleiloes: ${first.lastPage} páginas`);
    for (let page = 1; page <= first.lastPage; page++) {
      const { cards } = page === 1 ? first : parseListPage((await ctx.http.get(listUrl(page))).body);
      if (cards.length === 0) break;
      for (const card of cards) {
        if (ctx.filters.uf && !card.locality?.endsWith(`, ${ctx.filters.uf}`)) continue;
        yield { externalId: card.code, url: card.url, data: card } satisfies ListingRef;
      }
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    if (!useDetail()) return { ref, body: ref.data };
    return { ref, body: { card: ref.data, html: (await ctx.http.get(ref.url)).body } };
  },

  parse(raw) {
    const b = raw.body as MegaCard | { card: MegaCard; html: string };
    if ("html" in b) return enrichWithDetail(cardToListing(b.card), b.html);
    return cardToListing(b);
  },
};
