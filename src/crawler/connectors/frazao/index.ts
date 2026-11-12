import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { SITEMAP_LOTES, parseLot, parseSitemap, ufFromUrl } from "./parser";

/**
 * Frazão Leilões. Descoberta pelo sitemap oficial de lotes (todos são imóveis) e uma requisição por lote
 * (a listagem não traz preço/endereço). ~400 lotes ≈ 7 min a 1 req/s.
 * Filtro --uf: aplicado quando o slug termina em UF; slugs sem UF passam e são filtrados só na leitura.
 */
export const frazao: Connector = {
  id: "frazao",

  async *discover(ctx) {
    const lots = parseSitemap((await ctx.http.get(SITEMAP_LOTES)).body);
    ctx.log(`frazao: ${lots.length} lotes no sitemap`);
    for (const lot of lots) {
      const uf = ufFromUrl(lot.url);
      if (ctx.filters.uf && uf && uf !== ctx.filters.uf) continue;
      yield { externalId: lot.id, url: lot.url } satisfies ListingRef;
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    return { ref, body: (await ctx.http.get(ref.url)).body };
  },

  parse(raw) {
    return parseLot(raw.body as string, raw.ref.url);
  },
};
