import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, parseAreaM2, parseBRDateTime, parseBRL, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const FREITAS_BASE = "https://www.freitasleiloeiro.com.br";
export const PAGE_SIZE = 12;
/** Categoria 2 = Imóveis (o site lista as categorias em /Leiloes/PesquisarLotesTipos). */
export const listUrl = (page: number) =>
  `${FREITAS_BASE}/Leiloes/PesquisarLotes?Nome=&Categoria=2&TipoLoteId=0&FaixaValor=&Condicao=&PatioId=&ClienteSclId=0&PageNumber=${page}&TopRows=${PAGE_SIZE}`;
export const lotUrl = (leilaoId: string, lote: string) => `${FREITAS_BASE}/Leiloes/LoteDetalhes?leilaoId=${leilaoId}&loteNumero=${lote}`;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

export interface FreitasCard { leilaoId: string; lote: string; date: string | null; time: string | null; desc: string; price: number | null; city: string | null; uf: string | null; status: string; image: string | null }

/** Resposta de /Leiloes/PesquisarLotes: fragmento HTML com `.cardlote`; página sem lotes traz "Nenhum lote localizado". */
export function parseListPage(html: string): FreitasCard[] {
  const $ = cheerio.load(html);
  const cards: FreitasCard[] = [];
  $(".cardlote").each((_, el) => {
    const c = $(el);
    const m = c.find("a[href*='LoteDetalhes']").first().attr("href")?.match(/leilaoId=(\d+)&(?:amp;)?loteNumero=(\d+)/);
    if (!m) return;
    const loc = clean(c.find(".cardLote-details").first().text()).match(/^(.*?)\/([A-Z]{2})$/);
    const spans = c.find(".cardlote-data span, .cardLote-data span").map((__, s) => clean($(s).text())).get();
    cards.push({
      leilaoId: m[1]!, lote: m[2]!,
      date: spans[0] ?? null, time: spans[1] ?? null,
      desc: clean(c.find(".cardLote-descBens").first().text()),
      price: parseBRL(clean(c.find(".cardLote-vlr").first().text())),
      city: loc?.[1] ?? null, uf: loc?.[2] ?? null,
      status: clean(c.find(".cardLote-btn").first().text()),
      image: c.find("img.cardLote-img").attr("src") ?? null,
    });
  });
  return cards;
}

function statusOf(text: string): NormalizedListing["status"] {
  const t = text.toLowerCase();
  if (/aberto|lances/.test(t)) return "OPEN";
  if (/breve|aguard/.test(t)) return "UPCOMING";
  if (/vendid|arremat/.test(t)) return "SOLD";
  if (/suspens/.test(t)) return "SUSPENDED";
  if (/cancel/.test(t)) return "CANCELLED";
  return /encerr|finaliz/.test(t) ? "CLOSED" : "OPEN";
}

/** Descrição do site: "Rio Verde-GO. Pq. dos Jatobás. Rua 04 (Lt. 10 da qd. 05). Casa. Áreas totais: terr. 360,00m² e constr. 164,67m². Matr. 42.791 do RI local." */
function fromDescription(desc: string) {
  const land = parseAreaM2(desc.match(/terr(?:eno)?\.?\s*([\d.,]+)\s*m/i)?.[1] ?? desc.match(/[ÁA]rea de terreno\s*-?\s*([\d.,]+)\s*m/i)?.[1] ?? null);
  const built = parseAreaM2(desc.match(/constr(?:u[íi]da)?\.?(?:\s+lan[çc]ada no IPTU)?\s*-?\s*([\d.,]+)\s*m/i)?.[1] ?? desc.match(/[ÁA]rea constru[íi]da\s*-?\s*([\d.,]+)\s*m/i)?.[1] ?? null);
  const reg = desc.match(/Matr(?:[íi]cula)?s?\.?\s*(?:n[ºo°.]*\s*)?(\d[\d.]*\d)/i)?.[1] ?? null;
  const office = desc.match(/(\d+)\s*[ºª°]?\s*(?:RI|Of[ií]cio|CRI)\b/i)?.[1] ?? null;
  const occupation = /\bdesocupad/i.test(desc) ? "UNOCCUPIED" : /\bocupad[ao]\b/i.test(desc) ? "OCCUPIED" : "UNKNOWN";
  return { land, built, reg, office, occupation };
}

export function cardToListing(card: FreitasCard): NormalizedListing {
  const d = fromDescription(card.desc);
  const date = parseBRDateTime(card.date && card.time ? `${card.date} ${card.time}` : card.date);
  return NormalizedListingSchema.parse({
    externalId: `${card.leilaoId}-${card.lote}`,
    url: lotUrl(card.leilaoId, card.lote),
    title: `${card.desc.slice(0, 90).replace(/\s+\S*$/, "")}… (lote ${card.lote})`,
    description: card.desc,
    auctionType: "EXTRAJUDICIAL",
    status: statusOf(card.status),
    minBid: card.price,
    property: {
      type: parsePropertyType(card.desc), city: titleCaseCity(card.city), uf: normalizeUf(card.uf),
      landArea: d.land, privateArea: d.built, registry: d.reg, occupation: d.occupation,
    },
    rounds: card.price != null || date ? [{ number: 1, date, minBid: card.price }] : [],
    images: card.image ? [card.image] : [],
  });
}

/** Enriquece com a página do lote: tipo, endereço, descrição completa, matrícula, abertura de lances, modalidade e arquivos. */
export function enrichWithDetail(base: NormalizedListing, html: string): NormalizedListing {
  const $ = cheerio.load(html);
  const labeled = (label: string) => {
    let v: string | null = null;
    $("div.fw-bold").each((_, el) => { if (v == null && clean($(el).text()) === label) v = clean($(el).next("div").text()); });
    return v as string | null;
  };
  const tableRow = (label: string) => {
    let v: string | null = null;
    $("th").each((_, el) => { if (v == null && clean($(el).text()) === label) v = clean($(el).next("td").text()); });
    return v as string | null;
  };
  const header = clean($("h4").first().text());               // 'LEILÃO "ON-LINE" - 05 IMÓVEIS - BANCO BRADESCO S/A'
  const seller = header.match(/(?:-\s*)?((?:BANCO|BCO\.?)\s+[A-ZÀ-Ú0-9 .&\/]+(?:S\/?A)?)\s*$/i)?.[1]?.trim() ?? null;
  const kindCity = clean($(".fa-thumbtack").first().parent().text());   // "Casa | Rio Verde/GO"
  const [kind, cityUf] = kindCity.split("|").map((s) => s.trim());
  const address = labeled("Endereço:");
  const desc = clean($("div[style*='text-align:justify']").first().text()) || labeled("Descrição completa:") || base.description || "";
  const d = fromDescription(desc);
  const addr = address?.match(/^(.*?)(?:,\s*([^,]+?))?\s*-\s*([^/-]+)\/([A-Z]{2})$/);   // "Rua 04 (Lt. 10), Pq. dos Jatobás - Rio Verde/GO"
  const street = addr?.[1] && /^(R\.|Rua|Av|Avenida|Estrada|Rodovia|Travessa|Alameda|Pra[çc]a|Quadra|Paralela)/i.test(addr[1]) ? addr[1] : null;
  const openAt = parseBRDateTime(tableRow("Abertura p/ lances:"));
  const files = $("a[href$='.pdf']").map((_, a) => ({ href: $(a).attr("href") ?? "", name: clean($(a).text()) })).get();
  const notice = files.find((f) => /edital/i.test(f.name) || /\/edital\//i.test(f.href));
  const priceBlock = clean($("body").text()).match(/R\$\s*([\d.]+,\d{2})\s*Lance M[ií]nimo/i)?.[1];
  const payment = clean($("body").text());

  return NormalizedListingSchema.parse({
    ...base,
    detail: true,
    title: kind && cityUf ? `${kind} em ${cityUf} (lote ${base.externalId.split("-")[1]})` : base.title,
    description: desc.slice(0, 800) || base.description || null,
    seller: seller ?? base.seller ?? null,
    minBid: parseBRL(priceBlock) ?? base.minBid ?? null,
    noticeUrl: notice?.href ?? base.noticeUrl ?? null,
    acceptsFgts: /pode ser utilizado o FGTS|aceita FGTS|com uso do FGTS/i.test(payment) && !/sem uso do FGTS/i.test(payment),
    images: base.images,
    property: {
      ...base.property,
      type: kind ? parsePropertyType(kind) !== "OTHER" ? parsePropertyType(kind) : base.property.type : base.property.type,
      street, neighborhood: addr?.[2] ?? base.property.neighborhood ?? null,
      city: titleCaseCity(cityUf?.split("/")[0] ?? addr?.[3] ?? null) ?? base.property.city,
      uf: normalizeUf(cityUf?.split("/")[1] ?? addr?.[4] ?? null) ?? base.property.uf,
      landArea: d.land ?? base.property.landArea ?? null, privateArea: d.built ?? base.property.privateArea ?? null,
      registry: d.reg ?? base.property.registry ?? null, registryOffice: d.office ? `Ofício ${d.office}` : null,
      occupation: d.occupation !== "UNKNOWN" ? d.occupation : base.property.occupation,
    },
    rounds: base.rounds.length ? base.rounds.map((r) => ({ ...r, date: r.date ?? openAt })) : openAt ? [{ number: 1, date: openAt, minBid: base.minBid }] : [],
  });
}
