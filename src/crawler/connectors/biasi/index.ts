import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { PAGE_SIZE, TITLE_LOCATION, cardToListing, enrichWithDetail, listUrl, parseListPage, type BiasiCard } from "./parser";

/**
 * Biasi Leilões. A listagem usa o endpoint do próprio site (`/Sale/LotListSearch`, 48 por página) e o card já traz
 * preço, status e comitente. A página do lote (datas, endereço, matrícula, fotos, edital, coordenadas) é buscada por
 * padrão (~1 req/s); com BIASI_DETAIL=0 publica só os dados do card.
 */
const useDetail = () => process.env.BIASI_DETAIL !== "0";

export const biasi: Connector = {
  id: "biasi",

  async *discover(ctx) {
    const first = parseListPage((await ctx.http.get(listUrl(0))).body);
    ctx.log(`biasi: ${first.total} lotes`);
    for (let start = 0; start < first.total; start += PAGE_SIZE) {
      const { cards } = start === 0 ? first : parseListPage((await ctx.http.get(listUrl(start))).body);
      if (cards.length === 0) break;
      for (const card of cards) {
        // UF vem do fim do título ("... - Cidade/UF"); filtra antes de buscar o lote
        if (ctx.filters.uf && card.title.trim().match(TITLE_LOCATION)?.[2] !== ctx.filters.uf) continue;
        yield { externalId: card.id, url: card.url, data: card } satisfies ListingRef;
      }
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    if (!useDetail()) return { ref, body: ref.data };
    return { ref, body: { card: ref.data, html: (await ctx.http.get(ref.url)).body } };
  },

  parse(raw) {
    const b = raw.body as BiasiCard | { card: BiasiCard; html: string };
    if ("html" in b) return enrichWithDetail(cardToListing(b.card), b.html);
    return cardToListing(b);
  },
};
