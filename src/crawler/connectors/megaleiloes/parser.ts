import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, parseAreaM2, parseBRDateTime, parseBRL, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const MEGA_BASE = "https://www.megaleiloes.com.br";
export const listUrl = (page: number) => `${MEGA_BASE}/imoveis${page > 1 ? `?pagina=${page}` : ""}`;

export interface MegaCard {
  code: string;          // X131091 (extrajudicial) / J130030 (judicial)
  url: string;
  title: string;
  price: number | null;  // valor da praça ativa
  locality: string | null; // "Salvador, BA"
  auction: string;       // Judicial | Extrajudicial
  status: string;        // texto do card
  bank: string | null;   // slug do ícone do comitente
  image: string | null;
  instances: { label: string; date: string | null; value: number | null; active: boolean }[];
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const stripQuery = (u: string) => u.split("?")[0]!;

/** Lê os cards da página de listagem e o número total de páginas. */
export function parseListPage(html: string): { cards: MegaCard[]; lastPage: number } {
  const $ = cheerio.load(html);
  const cards: MegaCard[] = [];
  $("div[data-key] > div.card").each((_, el) => {
    const c = $(el);
    const code = clean(c.find(".card-number").first().text());
    const href = c.find("a.card-title").attr("href");
    if (!code || !href) return;
    const bankImg = c.find(".card-bank img").attr("src") ?? "";
    cards.push({
      code, url: stripQuery(href), title: clean(c.find("a.card-title").text()),
      price: parseBRL(clean(c.find(".card-price").first().text())),
      locality: clean(c.find("a.card-locality").first().text()) || null,
      auction: clean(c.find(".card-instance-title a").first().text()),
      status: clean(c.find(".card-status").first().text()),
      bank: bankImg.match(/bank_icons\/(?:leilao-)?(?:banco-)?([\w-]+)\.\w+$/)?.[1] ?? null,
      image: c.find("a.card-image").attr("data-bg") ?? null,
      instances: c.find(".card-instance-info .instance").map((_, i) => {
        const inst = $(i);
        const dateTxt = clean(inst.find("[class$='-instance-date']").text()); // "1ª Praça: 30/10/2026 às 15:00"
        return { label: dateTxt.split(":")[0] ?? "", date: dateTxt.match(/\d{2}\/\d{2}\/\d{4}(?:\s+às\s+\d{1,2}:\d{2})?/)?.[0] ?? null,
          value: parseBRL(clean(inst.find(".card-instance-value").text())), active: inst.hasClass("active") };
      }).get(),
    });
  });
  let lastPage = 1;
  $("a[href*='pagina=']").each((_, a) => {
    const n = Number(($(a).attr("href") ?? "").match(/[?&]pagina=(\d+)/)?.[1]);
    if (n > lastPage) lastPage = n;
  });
  return { cards, lastPage };
}

const SELLERS: Record<string, string> = { itau: "Itaú", bradesco: "Bradesco", santander: "Santander", caixa: "Caixa Econômica Federal", bb: "Banco do Brasil" };
const sellerOf = (slug: string | null) => (slug && slug !== "megaleiloes" ? SELLERS[slug] ?? slug.split("-").map((w) => w[0]!.toUpperCase() + w.slice(1)).join(" ") : null);

function statusOf(text: string): NormalizedListing["status"] {
  const t = text.toLowerCase();
  if (/em breve|aguardando/.test(t)) return "UPCOMING";
  if (/aberto/.test(t)) return "OPEN";
  if (/suspens/.test(t)) return "SUSPENDED";
  if (/cancel/.test(t)) return "CANCELLED";
  if (/vendid|arremat/.test(t)) return "SOLD";
  return "CLOSED";
}

export function cardToListing(card: MegaCard): NormalizedListing {
  // "Apartamento 129 m² - Nazaré - Salvador - BA"
  const parts = card.title.split(" - ").map((s) => s.trim());
  const [cityRaw, ufRaw] = card.locality?.split(",").map((s) => s.trim()) ?? [];
  const uf = normalizeUf(ufRaw ?? (parts.at(-1) ?? null));
  const city = titleCaseCity(cityRaw ?? parts.at(-2) ?? null);
  const neighborhood = parts.length >= 4 ? parts.at(-3)! : null;
  const type = parsePropertyType(parts[0]);
  const area = parseAreaM2(parts[0]!.match(/([\d.,]+)\s*m[²2]/i)?.[0] ?? null);
  const parking = Number(parts[0]!.match(/(\d+)\s*vagas?/i)?.[1]) || null;

  const rounds = card.instances.map((i, idx) => ({
    number: /^(\d+)/.exec(i.label)?.[1] ? Number(/^(\d+)/.exec(i.label)![1]) : idx + 1,
    date: parseBRDateTime(i.date), minBid: i.value,
  }));
  const active = card.instances.find((i) => i.active)?.value ?? null;

  return NormalizedListingSchema.parse({
    externalId: card.code,
    url: card.url,
    title: card.title,
    seller: sellerOf(card.bank),
    auctionType: /^judicial/i.test(card.auction) ? "JUDICIAL" : "EXTRAJUDICIAL",
    status: statusOf(card.status),
    minBid: card.price ?? active,
    property: {
      type, city, uf, neighborhood,
      ...(type === "LAND" || type === "RURAL" ? { landArea: area } : { privateArea: area }),
      parking,
    },
    rounds,
    images: card.image ? [card.image] : [],
  });
}

/** Enriquece com a página do lote: endereço, avaliação, processo, matrícula, ocupação, edital e fotos. */
export function enrichWithDetail(base: NormalizedListing, html: string): NormalizedListing {
  const $ = cheerio.load(html);
  const field = (header: string) => {
    let v: string | null = null;
    $(".item").each((_, el) => {
      if (v == null && clean($(el).children(".header").first().text()).toLowerCase() === header.toLowerCase()) v = clean($(el).children(".value").first().text());
    });
    return v as string | null;
  };

  // Localização: "Rua X, 293, Bairro, Cidade, UF"
  const loc = field("Localização")?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const number = loc[1] && /^\d+[\w-]*$|^s\/?n$/i.test(loc[1]) ? (/^s\/?n$/i.test(loc[1]) ? null : loc[1]) : null;
  const street = loc.length >= 4 ? loc[0]! : null;

  const appraisal = parseBRL(field("Valor de Avaliação")?.match(/R\$\s*[\d.,]+/)?.[0]);
  const processo = field("Processo")?.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/)?.[0] ?? null;
  const comitente = field("Comitente");

  // Descrição do lote (aba "Descrição"). Guardamos só as primeiras linhas, até o 1º trecho sobre
  // ações/débitos/histórico registral, que costuma citar partes e devedores (LGPD).
  const contentEl = $("#tab-description .content").first();
  contentEl.find("br").replaceWith("\n");
  const lines = contentEl.text().split("\n").map(clean).filter(Boolean);
  const stop = lines.findIndex((l, i) => i > 0 && /^(consta|ação|acao|débito|debito|eventual|obs|processo|autor|réu|reu)/i.test(l));
  const kept = (stop > 0 ? lines.slice(0, stop) : lines.slice(0, 3)).join("\n").slice(0, 800);
  const description = kept || base.description || null;

  const lotText = lines.join(" ");
  const reg = lotText.match(/MATR[ÍI]CULA\s+N[ºo°.]*\s*([\d.]*\d)/i)?.[1] ?? lotText.match(/\bMatr\.?\s*(?:n[ºo°.]*\s*)?([\d.]*\d)/i)?.[1];
  const office = lotText.match(/(\d+)\s*[ºª°]?\s*(?:CART[ÓO]RIO|OF[ÍI]CIO)\s+DE\s+REGISTRO/i)?.[1] ?? lotText.match(/\bdo\s+(\d+)\s*[ºª°]\s*do\s+CRI/i)?.[1];
  const head = lines[0] ?? "";
  const occ = /DESOCUPAD|LIVRE DE (?:OCUPANTES|PESSOAS)|\bLIVRE\b/i.test(head) ? "UNOCCUPIED" : /\bOCUPAD/i.test(head) ? "OCCUPIED" : "UNKNOWN";
  const fullText = lotText;

  const hrefs = $("a[href]").map((_, a) => $(a).attr("href")!).get();
  const edital = hrefs.find((h) => /\/auctions\/\d+\/[^/]*edital[^/]*\.pdf/i.test(h));
  const batchId = base.externalId.replace(/\D/g, "");
  const bySize = new Map<string, string>();
  for (const u of $("img, a, [data-bg], [data-mfp-src]").map((_, e) => $(e).attr("data-mfp-src") ?? $(e).attr("src") ?? $(e).attr("href") ?? $(e).attr("data-bg")).get()) {
    const m = u?.match(new RegExp(`/batches/${batchId}/([0-9a-f]{32})_(\\d+)x\\d+\\.(?:jpe?g|png|webp)$`, "i"));
    if (!u || !m) continue;
    const prev = bySize.get(m[1]!);
    if (!prev || Number(m[2]) > Number(prev.match(/_(\d+)x/)![1])) bySize.set(m[1]!, u);
  }
  const imgs = [...bySize.values()].slice(0, 10);

  return NormalizedListingSchema.parse({
    ...base,
    description,
    seller: comitente ?? base.seller,
    appraisalValue: appraisal && appraisal > 0 ? appraisal : base.appraisalValue,
    caseNumber: processo ?? base.caseNumber,
    noticeUrl: edital ?? base.noticeUrl,
    acceptsFinancing: base.acceptsFinancing || /(?:aceita|permite)[^.]{0,40}financiamento/i.test(fullText),
    acceptsFgts: base.acceptsFgts || /(?:aceita|permite)[^.]{0,40}FGTS/i.test(fullText),
    images: imgs.length ? imgs : base.images,
    property: {
      ...base.property,
      street: street ?? base.property.street,
      number: number ?? base.property.number,
      registry: reg ?? base.property.registry,
      registryOffice: office ? `Ofício ${office}` : base.property.registryOffice,
      occupation: occ,
    },
  });
}
