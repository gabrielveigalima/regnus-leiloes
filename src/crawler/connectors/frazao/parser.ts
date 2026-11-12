import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, normalizeZip, parseAreaM2, parseBRDateTime, parseBRL, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const FRAZAO_BASE = "https://www.frazaoleiloes.com.br";
export const SITEMAP_LOTES = `${FRAZAO_BASE}/sitemap-lotes.xml`;

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** URLs de lote do sitemap (`/lote/{id}-{slug}`), com o id numérico. */
export function parseSitemap(xml: string): { id: string; url: string }[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+\/lote\/(\d+)-[^<\s]*)\s*<\/loc>/g)].map((m) => ({ id: m[2]!, url: m[1]! }));
}

/** UF no fim do slug (".../casa-em-fatima-valenca-rj"); null quando o slug não traz UF. */
export function ufFromUrl(url: string): string | null {
  const m = url.match(/-([a-z]{2})$/);
  return m ? normalizeUf(m[1]!.toUpperCase()) : null;
}

function statusOf(text: string, finished: boolean): NormalizedListing["status"] {
  const t = text.toLowerCase();
  if (/liberado|aberto para lance/.test(t)) return finished ? "CLOSED" : "OPEN";
  if (/suspens/.test(t)) return "SUSPENDED";
  if (/cancel/.test(t)) return "CANCELLED";
  if (/vendid|arremat/.test(t)) return "SOLD";
  if (/encerr|finaliz/.test(t) || finished) return "CLOSED";
  return "UPCOMING"; // "aguardando abertura", "em breve" etc.
}

/** Texto do corpo com quebras de linha nos blocos (para regex por rótulo). */
function blockText($: cheerio.CheerioAPI): string {
  $("script, style, noscript").remove();
  $("br").replaceWith("\n");
  $("div, p, li, h1, h2, h3, h4, h5, tr, strong, span, label").each((_, el) => { $(el).append("\n"); });
  return $("body").text().replace(/[ \t ]+/g, " ").replace(/\n\s*/g, "\n");
}

const num = (re: RegExp, s: string) => parseAreaM2(s.match(re)?.[1] ?? null);

export function parseLot(html: string, url: string): NormalizedListing {
  const $ = cheerio.load(html);
  const id = url.match(/\/lotes?\/(\d+)/)?.[1];
  if (!id) throw new Error(`URL de lote inválida: ${url}`);

  const title = clean($("h1.lot-title").first().text()) || clean($("h1").first().text());
  const subtitle = clean($("h2.lot-subtitle").first().text());
  const statusText = clean($(".auction-status").first().text());
  const finished = $("#leilao-finalizado").attr("value") === "true";
  const labels = $(".label-grey.d-flex .mr-3, .label-grey .mr-3").map((_, e) => clean($(e).text())).get();
  const occLabel = labels.find((l) => /im[óo]vel (des)?ocupado/i.test(l)) ?? "";

  // Datas das praças: "Leilão: 17/11/2026 às 11h00" ou "1º Leilão: ... / 2º Leilão: ..."
  const dates = $("h4.label-grey").map((_, e) => clean($(e).text())).get().filter((t) => /leil[ãa]o/i.test(t))
    .map((t, i) => ({ number: Number(t.match(/^(\d+)\s*[ºª°]/)?.[1]) || i + 1, date: parseBRDateTime(t) }));

  const bidBlock = clean($("#minimum-increment").first().text()); // "Lance inicial: R$ 60.000,00"
  const lat = Number($("#lat").attr("value")), lng = Number($("#long").attr("value"));
  const text = blockText($);
  const whole = text.replace(/\n/g, " ").replace(/\s+/g, " ");
  // Só a seção do lote: o rodapé do site traz o endereço da própria Frazão (CEP, telefones etc.).
  const secStart = whole.indexOf("Informações sobre o Lote");
  const secEnd = whole.indexOf("Veja também", secStart);
  const flat = secStart >= 0 ? whole.slice(secStart, secEnd > secStart ? secEnd : undefined) : whole;

  const minBid = parseBRL(bidBlock.match(/R\$\s*[\d.,]+/)?.[0]) ?? parseBRL(flat.match(/Lance m[ií]nimo\s*R\$\s*([\d.,]+)/i)?.[1]);
  const appraisal = parseBRL(flat.match(/Valor Avaliado:?\s*R\$\s*([\d.,]+)/i)?.[1]);

  // Valores por praça (alienação fiduciária): "1º leilão: ... Lance Mínimo - R$ 333.033,06"
  const roundValues = new Map<number, number>();
  for (const m of flat.matchAll(/(\d)\s*[ºª°]\s*leil[ãa]o:[^$]{0,80}?Lance M[ií]nimo\s*-?\s*R\$\s*([\d.,]+)/gi)) roundValues.set(Number(m[1]), parseBRL(m[2])!);
  const rounds = dates.map((d) => ({ number: d.number, date: d.date, minBid: roundValues.get(d.number) ?? (d.number === 1 ? minBid : null) }));

  // Endereço: "Endereço Completo" (com CEP) ou subtítulo "RUA X, 991, BAIRRO, Cidade, UF"
  const addrFull = flat.match(/Endere[çc]o Completo\s*(.+?)\s*Caracter[íi]sticas/)?.[1] ?? "";
  const addr = (addrFull || subtitle).split(",").map((s) => s.trim()).filter(Boolean);
  const zip = normalizeZip(flat.match(/CEP:?\s*(\d{5}-?\d{3})/i)?.[1] ?? addrFull.match(/(\d{5}-\d{3})/)?.[1]);
  const parts = addr.filter((p) => !/^\d{5}-?\d{3}$/.test(p));
  const uf = normalizeUf(parts.at(-1) ?? title.match(/\b([A-Z]{2})$/)?.[1] ?? null);
  const city = titleCaseCity(parts.at(-2) ?? null);
  const number = parts[1] && /^\d[\w/-]*$/.test(parts[1]) ? parts[1] : null;
  const street = parts.length >= 3 ? parts[0]! : null;
  const nb = parts.length >= 5 ? parts.at(-3)! : null;
  const neighborhood = nb && !/^(na|no|em|nas|nos|dentro|junto|pr[óo]ximo)\s|\b(rua|avenida|rodovia|estrada)\b/i.test(nb) ? nb : null;

  const kind = flat.match(/Tipo do Im[óo]vel:?\s*([A-Za-zÀ-ú ]{3,30}?)(?=\s+Status|\s+Aceita|\s*$|\s+Doss)/)?.[1] ?? title;
  const type = parsePropertyType(kind);

  const privateArea = num(/[ÁA]rea privativa(?: coberta)?:?\s*(\d[\d.,]*)\s*m/i, flat) ?? num(/[ÁA]rea [Uú]til:?\s*(\d[\d.,]*)\s*m/i, flat);
  const built = num(/[ÁA]rea (?:constru[ií]da|edificada):?\s*(\d[\d.,]*)\s*m/i, flat);
  const landArea = num(/[ÁA]rea (?:total do )?terreno:?\s*(\d[\d.,]*)\s*m/i, flat) ?? num(/[ÁA]rea do terreno:?\s*(\d[\d.,]*)\s*m/i, flat);
  const totalArea = num(/[ÁA]rea total:?\s*(\d[\d.,]*)\s*m/i, flat);

  const bedrooms = Number(flat.match(/(\d+)\s*Quartos?/i)?.[1] ?? flat.match(/Dormit[óo]rios:\s*(\d+)/i)?.[1]) || null;
  const parking = Number(flat.match(/Vagas? de garagem:\s*(\d+)/i)?.[1]) || null;

  const registry = flat.match(/Matr[ií]cula(?:\(s\))?\s*:?\s*(?:n[ºo°.]*\s*)?(\d[\d.]*\d)/i)?.[1] ?? null;
  const office = flat.match(/(\d+)\s*[ºª°]?\s*(?:CRI|Cart[óo]rio|Of[ií]cio|Circunscri[çc][ãa]o)/i)?.[1] ?? null;

  const occupation = /desocupad/i.test(occLabel) || /desocupad/i.test(title) ? "UNOCCUPIED" : /ocupad/i.test(occLabel) ? "OCCUPIED" : "UNKNOWN";

  // Judicial só com termos próprios de execução. "Comarca de" e ações paralelas (revisional etc.) citadas
  // nas condições não tornam o leilão judicial.
  const judicial = /Leil[ãa]o Judicial|Exequente|Executad[oa]|Carta de Arremata[çc][ãa]o|Ju[íi]zo d[aoe]/i.test(whole);
  const caseNumber = judicial ? flat.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] ?? null : null;

  // Comitente só quando é pessoa jurídica identificável (evita expor pessoa física).
  const owner = flat.match(/Propriet[áa]rio pela matr[íi]cula:\s*([^.|]{3,60})/i)?.[1]?.split(/\s+(?:Ci[êe]ncia|D[ée]bitos?|A venda|Obs)/i)[0]?.trim();
  const seller = owner && /banco|ita[úu]|bradesco|santander|caixa|\bS\/?A\b|ltda/i.test(owner) ? owner : null;

  // Descrição: só o trecho descritivo, sem observações/condições (que podem citar partes — LGPD).
  const info = flat.indexOf("Informações sobre o Lote");
  let desc = info >= 0 ? flat.slice(info + "Informações sobre o Lote".length) : "";
  desc = desc.split(/Observa[çc][õo]es?|Observa[çc][ãa]o|Considera[çc][õo]es|Ci[êe]ncia de|Forma de pagamento|Propriet[áa]rio pela|Liberado para Lance|Maior lance/i)[0] ?? "";
  const description = clean(desc).slice(0, 600) || null;

  const images = [...new Set($("img").map((_, e) => $(e).attr("src") ?? $(e).attr("data-src")).get()
    .filter((u): u is string => !!u && /cdn\.frazaoleiloes\.com\.br\/images\/lot\//.test(u)))].slice(0, 10);

  const paymentText = flat.match(/(?:Forma de pagamento|Condi[çc][õo]es de [Pp]agamento)(.{0,500})/)?.[1] ?? "";
  return NormalizedListingSchema.parse({
    externalId: id,
    url: url.split("?")[0],
    title,
    description,
    seller,
    auctionType: judicial ? "JUDICIAL" : "EXTRAJUDICIAL",
    status: statusOf(statusText, finished),
    appraisalValue: appraisal && appraisal > 0 ? appraisal : null,
    minBid,
    caseNumber,
    acceptsFinancing: /financiamento (?:banc[áa]rio|imobili[áa]rio)|aceita financiamento/i.test(paymentText),
    acceptsFgts: /\bFGTS\b/.test(paymentText),
    property: {
      type, street, number, neighborhood, city, uf, zip,
      ...(Number.isFinite(lat) && Number.isFinite(lng) && lat > -34 && lat < 6 && lng > -74 && lng < -34 ? { lat, lng, geoPrecision: "SOURCE" } : {}),
      privateArea: privateArea ?? (type === "LAND" || type === "RURAL" ? null : built),
      totalArea, landArea, bedrooms, parking,
      registry, registryOffice: office ? `Ofício ${office}` : null, occupation,
    },
    rounds,
    images,
  });
}
