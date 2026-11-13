import type { Connector, ListingRef, RawListing } from "../../core/connector";
import { BB_BASE, PAGE_SIZE, cardToListing, enrichWithDetail, parseCatalogResponse, parseToken, type BBCard } from "./parser";

/** A página do imóvel (1 req/imóvel) traz matrícula, endereço e coordenadas. Desligue com BB_DETAIL=0. */
const useDetail = () => process.env.BB_DETAIL !== "0";

/**
 * Seu Imóvel BB (Banco do Brasil). A listagem é o POST /catalogo que o próprio site usa: exige o cookie de sessão do
 * GET /catalogo e o token `#_cppnp` dessa mesma sessão (o HttpClient mantém os cookies).
 */
export const seuimovelbb: Connector = {
  id: "bb", // = Source.id do Banco do Brasil

  async *discover(ctx) {
    const page = await ctx.http.get(`${BB_BASE}/catalogo`);
    const token = parseToken(page.body);
    if (!token) throw new Error("Seu Imóvel BB: token da sessão não encontrado");
    const form = (n: number) => ({ pagina: String(n), categorias: "", tipoVenda: "", tipoPagamento: "", evolua: "", localidade: "", minimo: "", maximo: "", texto: "", ordem: "", contento: "", cppnp: token });
    const first = parseCatalogResponse((await ctx.http.post(`${BB_BASE}/catalogo`, form(1))).body);
    const pages = Math.ceil(first.total / PAGE_SIZE);
    ctx.log(`bb (Seu Imóvel BB): ${first.total} imóveis em ${pages} páginas`);
    for (let n = 1; n <= pages; n++) {
      const { cards } = n === 1 ? first : parseCatalogResponse((await ctx.http.post(`${BB_BASE}/catalogo`, form(n))).body);
      if (cards.length === 0) break;
      for (const card of cards) {
        if (ctx.filters.uf && card.uf !== ctx.filters.uf) continue;
        yield { externalId: card.id, url: `${BB_BASE}/imovel/id/${card.id}`, data: card } satisfies ListingRef;
      }
    }
  },

  async fetchDetail(ref, ctx): Promise<RawListing> {
    if (!useDetail()) return { ref, body: ref.data };
    return { ref, body: { card: ref.data, html: (await ctx.http.get(ref.url)).body } };
  },

  parse(raw) {
    const b = raw.body as BBCard | { card: BBCard; html: string };
    if ("html" in b) return enrichWithDetail(cardToListing(b.card), b.html);
    return cardToListing(b);
  },
};
