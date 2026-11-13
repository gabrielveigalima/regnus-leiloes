import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, parseAreaM2, parseBRDateTime, parseBRL, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const LANCE_BASE = "https://www.grupolance.com.br";
export const listUrl = (page: number) => `${LANCE_BASE}/imoveis${page > 1 ? `?pagina=${page}` : ""}`;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();
const abs = (u: string) => (u.startsWith("//") ? `https:${u}` : u.startsWith("/") ? `${LANCE_BASE}${u}` : u);

export interface LanceCard { id: string; url: string; title: string; price: number | null; kind: string; locality: string | null; status: string; discount: string | null; image: string | null; lot: string | null }

export function parseListPage(html: string): { cards: LanceCard[]; pages: number; total: number } {
  const $ = cheerio.load(html);
  const summary = clean($(".summary").first().text()).match(/de\s+(\d+)\s+itens\.\s+Página\s+\d+\s+de\s+(\d+)/);
  const cards: LanceCard[] = [];
  $(".card-item[data-key]").each((_, el) => {
    const c = $(el);
    const a = c.find("a.card-title").first();
    const href = a.attr("href");
    const id = c.attr("data-key");
    if (!href || !id) return;
    const bg = c.find("a.card-image").attr("style")?.match(/url\(([^)]+)\)/)?.[1] ?? null;
    cards.push({
      id, url: abs(href).split("?")[0]!, title: clean(a.attr("title") ?? a.text()),
      price: parseBRL(clean(c.find(".card-price").first().text())),
      kind: clean(c.find(".card-info .text-uppercase").first().text()),
      locality: clean(c.find(".card-locality").first().text()) || null,
      status: clean(c.find(".card-status").first().text()),
      discount: clean(c.find(".card-counter").first().text()) || null,
      image: bg ? abs(bg.replace(/_thumb(?=\.\w+$)/, "")) : null,
      lot: clean(c.find(".card-instance-info a").first().text()) || null,
    });
  });
  return { cards, total: Number(summary?.[1]) || cards.length, pages: Number(summary?.[2]) || 1 };
}

/** "Casa, A.T.: 788m², A.C.: 233m², Vila Muriqui, Mangaratiba/RJ" (texto livre; só extrai o que é seguro). */
export function parseTitle(title: string) {
  const parts = title.split(",").map((s) => s.trim());
  const last = parts.at(-1)?.match(/^(.*)\/\s*([A-Z]{2})$/);
  const rest = last ? parts.slice(0, -1) : parts;
  const landM = title.match(/A\.T\.:\s*([\d.,]+)\s*m/i)?.[1], builtM = title.match(/A\.C\.:\s*([\d.,]+)\s*m/i)?.[1], totalM = title.match(/[áa]rea total\s*([\d.,]+)\s*m/i)?.[1];
  const loose = title.match(/,\s*([\d.]+)\s*m²/)?.[1];
  const neighborhood = last && rest.length >= 2 && !/\d|^A\.[TC]\./.test(rest.at(-1)!) && !/^(casa|apartamento|terreno|im[óo]vel|pr[ée]dio|sobrado|galp[ãa]o|hotel|sala|loja|fazenda|s[ií]tio)\b/i.test(rest.at(-1)!) ? rest.at(-1)! : null;
  return {
    type: parsePropertyType(parts[0]),
    city: last ? titleCaseCity(last[1]!.trim()) : null, uf: last ? normalizeUf(last[2]!) : null,
    landArea: parseAreaM2(landM ?? null), builtArea: parseAreaM2(builtM ?? totalM ?? loose ?? null), neighborhood,
  };
}

function statusOf(text: string, start: Date | null, now: Date): NormalizedListing["status"] {
  const t = text.toLowerCase();
  if (/breve|n[ãa]o iniciado/.test(t)) return "UPCOMING";
  if (/encerrad|finaliz/.test(t)) return "CLOSED";
  if (/suspens/.test(t)) return "SUSPENDED";
  if (/cancel/.test(t)) return "CANCELLED";
  if (/vendid|arremat/.test(t)) return "SOLD";
  return start && start.getTime() > now.getTime() ? "UPCOMING" : "OPEN";
}

const auctionTypeOf = (kind: string): NormalizedListing["auctionType"] => (/^extrajudicial/i.test(kind) ? "EXTRAJUDICIAL" : "JUDICIAL");

export function cardToListing(card: LanceCard, now = new Date()): NormalizedListing {
  const t = parseTitle(card.title);
  return NormalizedListingSchema.parse({
    externalId: card.id,
    url: card.url,
    title: card.title,
    auctionType: auctionTypeOf(card.kind),
    status: statusOf(card.status, null, now),
    minBid: card.price,
    property: {
      type: t.type, city: t.city, uf: t.uf, neighborhood: t.neighborhood,
      landArea: t.landArea, privateArea: t.builtArea,
    },
    rounds: card.price != null ? [{ number: 1, minBid: card.price }] : [],
    images: card.image ? [card.image] : [],
  });
}

/** Enriquece com a página do lote: valores, praças, endereço, coordenadas, edital, fotos e dados do processo (sem as partes). */
export function enrichWithDetail(base: NormalizedListing, html: string, now = new Date()): NormalizedListing {
  const $ = cheerio.load(html);
  const detail = (label: string) => {
    let v: string | null = null;
    $(".product-detail").each((_, el) => {
      const d = $(el);
      const own = clean(d.contents().filter((__, n) => n.type === "text").text());
      if (v == null && own.toLowerCase() === label.toLowerCase()) v = clean(d.children("span").first().text());
    });
    return v as string | null;
  };
  const current = parseBRL(detail("Valor atual")), appraisal = parseBRL(detail("Valor de avaliação"));

  const body = clean($("body").text());
  const start = parseBRDateTime(body.match(/Início do leilão \/ alienação:\s*(\d{2}\/\d{2}\/\d{4}\s+às\s+\d{1,2}:\d{2})/)?.[1]);
  const rounds: NormalizedListing["rounds"] = [];
  $(".product-instance").each((_, el) => {
    const txt = clean($(el).text());
    const n = Number(txt.match(/(\d+)\s*[ªº]\s*praça/i)?.[1]);
    if (!n) return;
    rounds.push({ number: n, date: parseBRDateTime(txt.match(/(\d{2}\/\d{2}\/\d{4}\s+às\s+\d{1,2}:\d{2})/)?.[1]), minBid: parseBRL(txt.match(/R\$\s*[\d.,]+/)?.[0]) });
  });
  rounds.sort((a, b) => a.number - b.number);

  // Informações adicionais (processo/vara/comarca). Autor e Réu NUNCA são lidos (LGPD).
  const info = new Map<string, string>();
  const infoText = body.split("Informações Adicionais")[1]?.split(/Outros lotes|Acesse sua Conta/)[0] ?? "";
  for (const m of infoText.matchAll(/(Leilão|Processo|Vara|Comarca)\s+(.+?)(?=\s+(?:Autor|Réu|Vara|Comarca|Processo|Leilão)\s|$)/g)) info.set(m[1]!, clean(m[2]));
  const caseNumber = info.get("Processo")?.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] ?? null;

  const locHeader = $("h2.section-title").filter((_, h) => /Localização/i.test($(h).text())).first();
  const address = clean(locHeader.next("div").text());
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  const maps = html.match(/maps\/embed[^"]*[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  const lat = maps ? Number(maps[1]) : NaN, lng = maps ? Number(maps[2]) : NaN;
  const geo = Number.isFinite(lat) && lat > -34 && lat < 6 && lng > -74 && lng < -34;

  const descHeader = $("h2.section-title").filter((_, h) => /Descrição do lote/i.test($(h).text())).first();
  const descEl = descHeader.next(".text-justify");
  descEl.find("br").replaceWith("\n");
  const descText = descEl.text();
  const comprei = descText.match(/https:\/\/comprei\.pgfn\.gov\.br\/[^\s"<]+/)?.[0] ?? null;
  const isPgfn = /PROCURADORIA DA FAZENDA NACIONAL|COMPREI/i.test(descText.slice(0, 400));
  // Lotes da PGFN trazem um texto padrão longo; o que descreve o bem vem depois de "DESCRIÇÃO"/"Descrição do imóvel".
  const marker = descText.search(/DESCRI[ÇC][ÃA]O\s*(?:DO\s+IM[ÓO]VEL\s*)?:/i);
  const bodyDesc = isPgfn ? (marker >= 0 ? descText.slice(marker) : "") : descText;
  const description = clean(bodyDesc).replace(/^DESCRI[ÇC][ÃA]O\s*(?:DO\s+IM[ÓO]VEL\s*)?:\s*/i, "").slice(0, 700) || base.description || null;

  const notice = $(".documents a").filter((_, a) => /edital/i.test($(a).text())).first().attr("href");
  const images = [...new Set($("a[href*='cdn.grupolance.com.br/batches/'], img[src*='cdn.grupolance.com.br/batches/']").map((_, e) => $(e).attr("href") ?? $(e).attr("src")).get()
    .filter((u): u is string => !!u && /\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/_thumb\./.test(u)).map(abs))].slice(0, 10);

  // Ícones de área do topo da página: "Área total" (terreno/total) e "Área construída"/"privativa".
  const areas: Record<string, number | null> = {};
  $("i[title]").each((_, el) => {
    const label = ($(el).attr("title") ?? "").toLowerCase();
    const v = parseAreaM2(clean($(el).parent().find("span").first().text()));
    if (v && /^área/.test(label)) areas[/total/.test(label) ? "total" : /constru|privativ|útil/.test(label) ? "built" : label] = v;
  });
  const t = parseTitle(base.title);
  const hasProcess = !!info.get("Processo");
  return NormalizedListingSchema.parse({
    ...base,
    detail: true,
    description,
    seller: isPgfn ? "Procuradoria-Geral da Fazenda Nacional (PGFN)" : base.seller ?? null,
    auctionType: base.auctionType === "EXTRAJUDICIAL" || !hasProcess ? base.auctionType : "JUDICIAL",
    status: statusOf("", start, now) === "UPCOMING" && base.status === "OPEN" ? "UPCOMING" : base.status,
    appraisalValue: appraisal ?? base.appraisalValue ?? null,
    minBid: current ?? base.minBid ?? null,
    caseNumber: base.auctionType === "EXTRAJUDICIAL" ? null : caseNumber,
    noticeUrl: notice ? abs(notice) : comprei ?? base.noticeUrl ?? null,
    rounds: rounds.length ? rounds : base.rounds,
    images: images.length ? images : base.images,
    property: {
      ...base.property,
      street: parts.length >= 3 ? parts[0]! : base.property.street ?? null,
      neighborhood: parts.length >= 4 ? parts.at(-3)! : base.property.neighborhood ?? null,
      city: parts.length >= 2 ? titleCaseCity(parts.at(-2)!) ?? base.property.city : base.property.city,
      uf: parts.length >= 2 ? normalizeUf(parts.at(-1)!) ?? base.property.uf : base.property.uf,
      ...(geo ? { lat, lng, geoPrecision: "SOURCE" } : {}),
      landArea: areas.total && base.property.type !== "APARTMENT" ? areas.total : t.landArea ?? base.property.landArea ?? null,
      totalArea: areas.total ?? null,
      privateArea: areas.built ?? t.builtArea ?? base.property.privateArea ?? null,
      occupation: /DESOCUPADO|LIVRE DE (?:OCUPANTES|PESSOAS)/i.test(descText.slice(0, 300)) ? "UNOCCUPIED" : /\bOCUPADO\b/i.test(descText.slice(0, 300)) ? "OCCUPIED" : "UNKNOWN",
    },
  });
}
