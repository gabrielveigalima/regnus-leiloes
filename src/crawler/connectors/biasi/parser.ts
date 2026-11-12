import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, normalizeZip, parseAreaM2, parseBRDateTime, parseBRL, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const BIASI_BASE = "https://www.biasileiloes.com.br";
export const PAGE_SIZE = 48;
/** "... - Cidade/UF" ou "... em Cidade/UF (Parte C)". */
export const TITLE_LOCATION = /^(.*?)\s*\/\s*([A-Z]{2})(?:\s*\(.*\))?\s*$/;
/** Endpoint que o próprio site usa para montar a listagem (HTML parcial). Sem categoria = todos os lotes. */
export const listUrl = (start: number) => `${BIASI_BASE}/Sale/LotListSearch?categoria=&subcategoria=&term=&start=${start}&limit=${PAGE_SIZE}&buscaImovel=false`;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

export interface BiasiCard { id: string; url: string; title: string; price: number | null; status: string; seller: string | null; image: string | null }

export function parseListPage(html: string): { cards: BiasiCard[]; total: number } {
  const $ = cheerio.load(html);
  const total = Number($("#leilao-lista-lote").attr("total")) || 0;
  const cards: BiasiCard[] = [];
  $("a.leilao-lote").each((_, el) => {
    const a = $(el);
    const href = a.attr("href");
    const id = a.attr("data-id") ?? href?.match(/\/lotes\/(\d+)/)?.[1];
    if (!href || !id) return;
    cards.push({
      id, url: new URL(href, BIASI_BASE).toString(),
      title: clean(a.find(".card-title").first().text()),
      price: parseBRL(clean(a.find(".price-leiloes span").last().text())),
      status: clean(a.find(".label-md").first().text()),
      seller: clean(a.find("img.image-comitente").attr("alt")).replace(/^Logo de\s+/i, "") || null,
      image: a.find("img.card-img-cover").attr("src") ?? null,
    });
  });
  return { cards, total };
}

function statusOf(text: string): NormalizedListing["status"] {
  const t = text.toLowerCase();
  if (/liberado|aberto/.test(t)) return "OPEN";
  if (/suspens/.test(t)) return "SUSPENDED";
  if (/cancel/.test(t)) return "CANCELLED";
  if (/vendid|arremat/.test(t)) return "SOLD";
  if (/encerr|finaliz/.test(t)) return "CLOSED";
  return "UPCOMING";
}

const sellerOk = (s: string | null) => (s && /banco|ita[úu]|bradesco|santander|caixa|sicoob|rodobens|consórcio|consorcio|\bS\/?A\b|ltda/i.test(s) ? s : null);

/** Dados do card (listagem): título, preço inicial, status e comitente. Suficiente para publicar o anúncio. */
export function cardToListing(card: BiasiCard): NormalizedListing {
  const m = card.title.match(TITLE_LOCATION);
  // Cidade = trecho depois do último " - " ou, sem ele, depois do último " em "; ambíguo ("... no Centro de X/UF") fica vazio até o detalhe.
  const cityRaw = m ? (m[1]!.split(" - ").length > 1 ? m[1]!.split(" - ").at(-1)! : m[1]!.split(/\s+em\s+/i).length > 1 ? m[1]!.split(/\s+em\s+/i).at(-1)! : null) : null;
  return NormalizedListingSchema.parse({
    externalId: card.id,
    url: card.url,
    title: card.title,
    seller: sellerOk(card.seller),
    status: statusOf(card.status),
    minBid: card.price,
    property: { type: parsePropertyType(card.title), city: titleCaseCity(cityRaw?.trim() ?? null), uf: normalizeUf(m?.[2] ?? null) },
    rounds: card.price != null ? [{ number: 1, minBid: card.price }] : [],
    images: card.image ? [card.image] : [],
  });
}

const num = (re: RegExp, s: string) => parseAreaM2(s.match(re)?.[1] ?? null);

/** Enriquece com a página do lote: datas, endereço, áreas, matrícula, ocupação, edital, fotos e coordenadas da fonte. */
export function enrichWithDetail(base: NormalizedListing, html: string): NormalizedListing {
  const $ = cheerio.load(html);
  const lat = Number($("#lat").attr("value")), lng = Number($("#long").attr("value"));
  const subtitle = clean($(".lot-subtitle").first().text());
  const files = $(".file-list a").map((_, a) => ({ href: $(a).attr("href") ?? "", name: clean($(a).text()) })).get();
  const imgs = new Map<string, string>();
  $("img.foto-leilao").each((_, e) => {
    const src = $(e).attr("src") ?? $(e).attr("data-src");
    const key = $(e).attr("key");
    if (src && key && !imgs.has(key)) imgs.set(key, src);
  });

  $("script, style, noscript").remove();
  $("br").replaceWith("\n");
  $("div, p, li, h1, h2, h3, h4, tr, strong, span, label").each((_, el) => { $(el).append("\n"); });
  const whole = $("body").text().replace(/[ \t\u00a0]+/g, " ").replace(/\n\s*/g, "\n");
  const start = whole.indexOf("Informações sobre o Lote");
  const end = whole.indexOf("Confirmação de Lance", start);
  const topEnd = start >= 0 ? start : whole.length;
  const top = whole.slice(0, topEnd).replace(/\n/g, " ").replace(/\s+/g, " ");
  const sectionLines = (start >= 0 ? whole.slice(start + 24, end > start ? end : undefined) : "").split("\n").map(clean).filter(Boolean);
  const sec = sectionLines.join(" ");

  // Praças: "Data: 17/11/2026 às 11h00" ou "1º Leilão dia 25/11/2026 às 10h10"
  const roundsFound: { number: number; date: Date | null }[] = [];
  for (const m of top.matchAll(/(?:(\d)\s*[ºª°]\s*Leil[ãa]o dia|Data:)\s*(\d{2}\/\d{2}\/\d{4})\s*às\s*(\d{1,2}h\d{2})/g)) {
    roundsFound.push({ number: m[1] ? Number(m[1]) : 1, date: parseBRDateTime(`${m[2]} ${m[3]}`) });
  }
  const minBid = parseBRL(top.match(/Lance Inicial\s*-\s*R\$\s*([\d.,]+)/)?.[1]) ?? base.minBid ?? null;
  const rounds = roundsFound.length
    ? roundsFound.map((r) => ({ number: r.number, date: r.date, minBid: r.number === 1 ? minBid : null }))
    : base.rounds;
  const statusText = top.match(/(Liberado para Lance|Encerrado|Finalizado|Suspenso|Cancelado|Vendido|Aguardando[^|]{0,30}|Em breve)/i)?.[1];

  // Endereço: "Endereço Completo" (com CEP) > subtítulo "Casa - Bairro - Cidade/UF. Rua X, 95, Bairro, Cidade/UF. Lance mínimo…"
  // A cidade vem do título (o subtítulo às vezes traz outra cidade por erro de digitação do comitente).
  const full = sec.match(/Endere[çc]o Completo\s*(.+?)\s*Caracter[íi]sticas/)?.[1] ?? "";
  const fullParts = full.split(",").map((s) => s.trim()).filter((p) => p && !/^\d{5}-?\d{3}$/.test(p));
  const subAddr = subtitle.split(/\.\s+/).find((s) => /^(?:R\.|Rua|Avenida|Av\.?|Alameda|Travessa|Estrada|Rodovia|Pra[çc]a|Largo|Quadra|Lote|Setor)/i.test(s)) ?? "";
  const subParts = subAddr.split(",").map((s) => s.trim()).filter(Boolean);
  let street: string | null = null, number: string | null = null, neighborhood: string | null = null;
  if (fullParts.length >= 4) {
    street = fullParts[0] ?? null;
    number = /^\d[\w/ -]*$/.test(fullParts[1]!) ? fullParts[1]! : null;
    neighborhood = fullParts.length >= 5 ? fullParts.at(-3)! : null; // ..., Bairro, Cidade, UF
  } else if (subParts.length) {
    street = subParts[0]!;
    number = subParts[1] && /^\d[\w/ -]*$/.test(subParts[1]) ? subParts[1] : null;
    neighborhood = subParts.length >= 4 ? subParts[2]! : null;
  }
  // Cidade ambígua no título: usa a do endereço (último item antes da UF).
  const addrCity = fullParts.length >= 4 ? fullParts.at(-2)! : subParts.at(-1)?.replace(/\/[A-Z]{2}$/, "") ?? null;
  const zip = normalizeZip(full.match(/(\d{5}-?\d{3})\s*$/)?.[1] ?? null);

  const registry = sec.match(/Matr[ií]cula(?:\(s\))?\s*(?:n[ºo°.]*\s*|:\s*)(\d[\d.]*\d)/i)?.[1] ?? null;
  const office = sec.match(/(\d+)\s*[ºª°]?\s*(?:CRI|SNR|Cart[óo]rio|Of[ií]cio|Circunscri[çc][ãa]o)/i)?.[1] ?? null;
  const kind = sec.match(/Tipo do Im[óo]vel:\s*([A-Za-zÀ-ú ]{3,30}?)(?=\s+Status|\s+Aceita|\s+Doss|$)/)?.[1] ?? base.title;
  const type = parsePropertyType(kind);
  const privateArea = num(/[ÁA]rea (?:privativa|[Uú]til)(?: coberta)?:?\s*(\d[\d.,]*)\s*m/i, sec);
  const built = num(/[ÁA]rea (?:constru[ií]da|edificada):?\s*(\d[\d.,]*)\s*m/i, sec);
  const landArea = num(/[ÁA]rea (?:total do |do )?terreno:?\s*(\d[\d.,]*)\s*m/i, sec);
  const totalArea = num(/[ÁA]rea total:?\s*(\d[\d.,]*)\s*m/i, sec);
  const bedrooms = Number(sec.match(/Dormit[óo]rios:\s*(\d+)/i)?.[1] ?? sec.match(/(\d+)\s*(?:quartos?|dormit[óo]rios?)/i)?.[1]) || null;
  const parking = Number(sec.match(/Vagas? de garagem:\s*(\d+)/i)?.[1]) || null;

  const occHead = sectionLines.slice(0, 4).join(" ") + " " + (sec.match(/Status da Ocupa[çc][ãa]o:\s*(\w+)/i)?.[1] ?? "");
  const occupation = /desocupad|vago|livre/i.test(occHead) ? "UNOCCUPIED" : /ocupad/i.test(occHead) ? "OCCUPIED" : "UNKNOWN";

  // Judicial só com termos próprios de execução; ação paralela (ex.: "ação revisional") não torna o leilão judicial.
  const judicial = /Leil[ãa]o Judicial|Exequente|Executad[oa]|Carta de Arremata[çc][ãa]o|Ju[íi]zo d[aoe]/i.test(whole);
  const caseNumber = judicial ? sec.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] ?? null : null;

  // Descrição: apenas o trecho descritivo; condições/observações (que podem citar partes) ficam de fora (LGPD).
  const descLines: string[] = [];
  for (const l of sectionLines) {
    if (/^(-|Obs|C[óo]digo do Im[óo]vel|Considera[çc][õo]es|Condi[çc][õo]es|D[êe] seu lance|Entrar no|Endere[çc]o Completo|Caracter[íi]sticas)/i.test(l)) {
      if (descLines.length) break; else continue;
    }
    if (/^(Ocupado|Desocupado)$/i.test(l) || l === base.title) continue;
    descLines.push(l);
  }
  const description = descLines.join(" ").replace(/\s+([,.;])/g, "$1").slice(0, 600) || base.description || null;

  const owner = sec.match(/C[óo]digo do Im[óo]vel\s*\d+\s*[–-]\s*([^.|]{3,60})/)?.[1]?.trim() ?? null;
  const fin = sec.match(/(?:Condi[çc][õo]es de Pagamento|Obs:)(.{0,400})/i)?.[1] ?? "";

  const editalFile = files.find((f) => /edital/i.test(f.name) || /leilaoanexo/.test(f.href));

  return NormalizedListingSchema.parse({
    ...base,
    description,
    seller: sellerOk(owner) ?? base.seller ?? null,
    auctionType: judicial ? "JUDICIAL" : "EXTRAJUDICIAL",
    status: statusText ? statusOf(statusText) : base.status,
    minBid,
    caseNumber,
    noticeUrl: editalFile ? new URL(editalFile.href, BIASI_BASE).toString() : base.noticeUrl,
    acceptsFinancing: /cr[ée]dito imobili[áa]rio|financiamento/i.test(fin),
    acceptsFgts: /\bFGTS\b/.test(fin),
    rounds,
    images: imgs.size ? [...imgs.values()].slice(0, 10) : base.images,
    property: {
      ...base.property,
      city: base.property.city ?? titleCaseCity(addrCity),
      type: type === "OTHER" ? base.property.type : type,
      street, number, neighborhood: neighborhood ? titleCaseCity(neighborhood) : null, zip,
      // Coordenada fora do Brasil (erro do comitente) é descartada em vez de derrubar o anúncio.
      ...(Number.isFinite(lat) && Number.isFinite(lng) && lat > -34 && lat < 6 && lng > -74 && lng < -34 ? { lat, lng, geoPrecision: "SOURCE" } : {}),
      privateArea: privateArea ?? (type === "LAND" || type === "RURAL" ? null : built),
      totalArea, landArea, bedrooms, parking,
      registry, registryOffice: office ? `Ofício ${office}` : null, occupation,
    },
  });
}
