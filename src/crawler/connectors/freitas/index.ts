import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { cardToListing, enrichWithDetail, listUrl, parseListPage, type FreitasCard } from "./parser";

/** A página do lote (1 req/lote, ~40 lotes) traz endereço, matrícula e edital. FREITAS_DETAIL=0 = só o card. */
const useDetail = () => process.env.FREITAS_DETAIL !== "0";

/** Freitas Leiloeiro (categoria Imóveis). A lista é o `/Leiloes/PesquisarLotes` que a página chama ao rolar (12 por página). */
export const freitas: Connector = {
  id: "freitas",

  async *discover(ctx) {
    for (let page = 1; page <= 200; page++) {
      const cards = parseListPage((await ctx.http.get(listUrl(page))).body);
      if (page === 1) ctx.log(`freitas: página 1 com ${cards.length} lotes`);
      if (cards.length === 0) break;
      for (const card of cards) {
        if (ctx.filters.uf && card.uf !== ctx.filters.uf) continue;
        yield { externalId: `${card.leilaoId}-${card.lote}`, url: cardToListing(card).url, data: card } satisfies ListingRef;
      }
      if (cards.length < 12) break;
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    if (!useDetail()) return { ref, body: ref.data };
    return { ref, body: { card: ref.data, html: (await ctx.http.get(ref.url)).body } };
  },

  parse(raw) {
    const b = raw.body as FreitasCard | { card: FreitasCard; html: string };
    if ("html" in b) return enrichWithDetail(cardToListing(b.card), b.html);
    return cardToListing(b);
  },
};
