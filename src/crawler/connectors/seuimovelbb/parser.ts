import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, parseAreaM2, parseBRDateTime, parseBRL, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const BB_BASE = "https://seuimovelbb.com.br";
export const PAGE_SIZE = 50;
export const detailUrl = (id: string) => `${BB_BASE}/imovel/id/${id}`;
export const imageUrl = (id: string, n = 1) => `${BB_BASE}/imagem/imovel/${id}_${n}.jpg`;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

export interface BBCard { id: string; type: string | null; price: number | null; city: string | null; uf: string | null; auctionText: string | null; partner: string | null; acceptsBB: boolean }

/** Token anti-CSRF da página do catálogo (`#_cppnp`); a sessão (cookie) deve ser a mesma do POST. */
export function parseToken(html: string): string | null {
  return cheerio.load(html)("#_cppnp").first().text().trim() || null;
}

/** Resposta JSON do POST /catalogo: { lista: "<html dos cards>", imoveis: "975", paginacao } */
export function parseCatalogResponse(body: string): { cards: BBCard[]; total: number } {
  const json = JSON.parse(body) as { lista?: string; imoveis?: string; erro?: string };
  if (json.erro) throw new Error(`Seu Imóvel BB: ${json.erro}`);
  const $ = cheerio.load(json.lista ?? "");
  const cards: BBCard[] = [];
  $("div.carta").each((_, el) => {
    const c = $(el);
    const id = c.find("a[href*='/imovel/id/']").first().attr("href")?.match(/\/imovel\/id\/(\d+)/)?.[1];
    if (!id) return;
    const loc = clean(c.find(".localidade").first().text()).match(/^(.*?)\s*-\s*([A-Z]{2})$/);
    cards.push({
      id,
      type: clean(c.find(".tipo").first().text()) || null,
      price: parseBRL(clean(c.find(".valor").first().text().match(/R\$\s*[\d.,]+/)?.[0])),
      city: loc?.[1] ?? null, uf: loc?.[2] ?? null,
      auctionText: clean(c.find(".corpo-evento").text()).match(/\d{2}\/\d{2}\s+às\s+\d{1,2}h(?:\d{2})?/)?.[0] ?? null,
      partner: clean(c.text()).match(/Parceiro:\s*(.+?)(?:\s{2,}|$)/)?.[1]?.trim() ?? null,
      acceptsBB: /Aceita BB\?/.test(c.find(".valor").first().text()) || c.find(".aceitabb").length > 0,
    });
  });
  return { cards, total: Number(json.imoveis) || cards.length };
}

/** "17/11 às 10h" (sem ano) → próxima ocorrência futura em Brasília. */
export function dateFromCard(text: string | null, now = new Date()): Date | null {
  const m = text?.match(/(\d{2})\/(\d{2})\s+às\s+(\d{1,2})h(\d{2})?/);
  if (!m) return null;
  for (const y of [now.getFullYear(), now.getFullYear() + 1]) {
    const d = parseBRDateTime(`${m[1]}/${m[2]}/${y} ${m[3]}:${m[4] ?? "00"}`);
    if (d && d.getTime() >= now.getTime() - 86_400_000) return d;
  }
  return null;
}

export function cardToListing(card: BBCard, now = new Date()): NormalizedListing {
  const date = dateFromCard(card.auctionText, now);
  const type = parsePropertyType(card.type);
  return NormalizedListingSchema.parse({
    externalId: card.id,
    url: detailUrl(card.id),
    title: `${card.type ?? "Imóvel"} em ${titleCaseCity(card.city) ?? ""}/${card.uf ?? ""} (BB ${card.id})`,
    seller: "Banco do Brasil",
    auctionType: date ? "EXTRAJUDICIAL" : "DIRECT_SALE",
    status: "OPEN",
    minBid: card.price,
    property: { type, city: titleCaseCity(card.city), uf: normalizeUf(card.uf) },
    rounds: date || card.price != null ? [{ number: 1, date, minBid: card.price }] : [],
    images: [imageUrl(card.id)],
  });
}

const num = (re: RegExp, s: string) => parseAreaM2(s.match(re)?.[1] ?? null);

/** Enriquece com a página do imóvel: descrição legal, matrícula, endereço, áreas, ocupação, data do leilão, fotos e coordenadas. */
export function enrichWithDetail(base: NormalizedListing, html: string): NormalizedListing {
  const $ = cheerio.load(html);
  // coordenadas no script do mapa: `var map, path = {lat: -22.967106, lng: -43.411942};`
  const m = html.match(/lat:\s*(-?\d{1,2}\.\d+),\s*lng:\s*(-?\d{1,3}\.\d+)/);
  const coords = m && Number(m[1]) > -34 && Number(m[1]) < 6 && Number(m[2]) > -74 && Number(m[2]) < -34 ? { lat: Number(m[1]), lng: Number(m[2]) } : undefined;

  $("script, style, noscript").remove();
  $("br").replaceWith("\n");
  $("div, p, li, h1, h2, h3, h4, tr, span").each((_, el) => { $(el).append("\n"); });
  const text = $("body").text().replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*/g, "\n");
  const flat = text.replace(/\n/g, " ").replace(/\s+/g, " ");

  const descStart = flat.indexOf("Descrição ID");
  const descEnd = flat.search(/Observações|Proximidades/);
  const desc = descStart >= 0 ? flat.slice(descStart + "Descrição".length, descEnd > descStart ? descEnd : undefined) : "";
  // só a descrição legal do imóvel; condições "a) b) c)" (ocupação, locação, IPTU) ficam fora do texto guardado
  const legal = clean(desc.split(/\s[a-d]\)\s/)[0]!.replace(/^\s*ID\d+\s+[^()]*\([A-Z]{2}\)\s*/i, "").replace(/Descrição legal:\s*/gi, ""));
  const conditions = desc.slice(legal.length);

  // o preço do próprio imóvel vem antes de "Descrição"; depois dela aparecem os cards de "Imóveis relacionados"
  const head = descStart >= 0 ? flat.slice(0, descStart) : flat.slice(0, 1500);
  const price = parseBRL(head.match(/R\$\s*([\d.]+,\d{2})\s*Valor (?:para proposta|de lance inicial)/)?.[1]);
  const auctionDate = parseBRDateTime(flat.match(/Data do leilão:\s*(\d{2}\/\d{2}\/\d{4})\s*a partir das\s*(\d{1,2})h(\d{2})?/)?.slice(1).join(" ").replace(/(\d{2}\/\d{2}\/\d{4}) (\d+) ?(\d{2})?$/, "$1 $2:$3") ?? null);

  const reg = legal.match(/matr[íi]cula\s*(?:n[ºo°.]*\s*)?(\d[\d.]*(?:\s*-\s*\d+-?[A-Z])?)/i)?.[1]?.trim() ?? null;
  const office = legal.match(/(\d+)\s*[ºª°]?\s*(?:Of[ií]cio|CRI)/i)?.[1] ?? null;
  const addr = legal.match(/\b((?:Rua|R\.|Avenida|Av\.?|AV\.|Estrada|Travessa|Alameda|Rodovia|Pra[çc]a)\s*[^,]+?),\s*(?:n[ºo°.]*\s*)?(\d+[\w-]*)/i);
  const neighborhood = legal.match(/Bairro\s+([^,.\-–]+)/i)?.[1]?.trim() ?? null;

  const occupation = /desocupad|livre de (?:ocupantes|pessoas)/i.test(conditions) ? "UNOCCUPIED" : /ocupad[oa] por terceiros|encontra-se ocupad/i.test(conditions) ? "OCCUPIED" : "UNKNOWN";
  const kind = legal.match(/Im[óo]vel (?:Urbano|Rural)[^:]*:\s*([^,.]{0,60})/i)?.[1] ?? "";
  const type = /vaga de garagem|dep[óo]sito de garagem/i.test(legal.slice(0, 200)) ? "OTHER"
    : /Im[óo]vel Rural/i.test(legal.slice(0, 40)) ? "RURAL" : parsePropertyType(kind || legal.slice(0, 160));

  const imgs = [...new Set([...html.matchAll(/\/imagem\/imovel\/(\d+)_(\d+)\.jpg/g)].filter((m) => m[1] === base.externalId).map((m) => Number(m[2])))]
    .sort((a, b) => a - b).slice(0, 10).map((n) => imageUrl(base.externalId, n));

  const privateArea = num(/[áa]rea privativa(?: real)? de\s*(\d[\d.,]*)\s*m/i, legal) ?? num(/[áa]rea constru[ií]da de\s*(\d[\d.,]*)\s*m/i, legal);
  const landArea = num(/terreno de\s*(\d[\d.,]*)\s*m/i, legal) ?? num(/lote com [áa]rea total de\s*(\d[\d.,]*)\s*m/i, legal);
  const totalArea = num(/[áa]rea (?:real )?total de\s*(\d[\d.,]*)\s*m/i, legal);
  const bedrooms = Number(legal.match(/(\d+)\s*(?:\([^)]*\)\s*)?(?:quartos?|dormit[óo]rios?)/i)?.[1]) || null;

  const rounds = auctionDate || price != null || base.minBid != null
    ? [{ number: 1, date: auctionDate ?? base.rounds[0]?.date ?? null, minBid: price ?? base.minBid ?? null }] : base.rounds;

  return NormalizedListingSchema.parse({
    ...base,
    detail: true,
    description: legal.slice(0, 700) || base.description || null,
    minBid: price ?? base.minBid ?? null,
    auctionType: (auctionDate ?? base.rounds[0]?.date) ? "EXTRAJUDICIAL" : "DIRECT_SALE",
    rounds,
    images: imgs.length ? imgs : base.images,
    property: {
      ...base.property,
      // o tipo do card (Casa, Apartamento, Prédio…) é mais confiável; o texto só serve quando o card não traz tipo
      type: base.property.type !== "OTHER" ? base.property.type : type,
      street: addr ? clean(addr[1]).replace(/^(?:R\.|AV\.|Av\.)\s*/i, (m) => (/^R/i.test(m) ? "Rua " : "Avenida ")) : null, number: addr?.[2] ?? null, neighborhood: neighborhood ? titleCaseCity(neighborhood) : null,
      ...(coords ? { lat: coords.lat, lng: coords.lng, geoPrecision: "SOURCE" } : {}),
      privateArea, landArea, totalArea, bedrooms,
      registry: reg, registryOffice: office ? `Ofício ${office}` : null, occupation,
    },
  });
}
