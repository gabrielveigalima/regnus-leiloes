import { parse as parseCsv } from "csv-parse/sync";
import * as cheerio from "cheerio";
import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, normalizeZip, parseBRL, parseBRDateTime, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const CAIXA_BASE = "https://venda-imoveis.caixa.gov.br";
export const csvUrl = (uf: string) => `${CAIXA_BASE}/listaweb/Lista_imoveis_${uf}.csv`;
export const detailUrl = (id: string) => `${CAIXA_BASE}/sistema/detalhe-imovel.asp?hdnimovel=${id}`;

export interface CaixaRow {
  id: string; uf: string; city: string; neighborhood: string; address: string;
  price: string; appraisal: string; financing: string; description: string; mode: string; link: string;
}

/** CSV vem em ISO-8859-1, separador ';', com 2 linhas de cabeçalho. Recebe já decodificado. */
export function parseCaixaCsv(text: string): CaixaRow[] {
  const records: string[][] = parseCsv(text, { delimiter: ";", relax_column_count: true, relax_quotes: true, skip_empty_lines: true });
  const rows: CaixaRow[] = [];
  for (const r of records) {
    const f = r.map((x) => x.trim());
    if (f.length < 12 || !/^\d+$/.test(f[0]!)) continue; // pula cabeçalhos
    rows.push({ id: f[0]!, uf: f[1]!, city: f[2]!, neighborhood: f[3]!, address: f[4]!, price: f[5]!, appraisal: f[6]!, financing: f[8]!, description: f[9]!, mode: f[10]!, link: f[11]! });
  }
  return rows;
}

const num = (re: RegExp, s: string) => { const m = s.match(re); return m ? Number(m[1]) : null; };
const pos = (n: number | null) => (n && n > 0 ? n : null);

/** "RUA X, N. 670, LT 09 QD O" -> rua, número, complemento. */
export function splitAddress(addr: string) {
  const m = addr.match(/^(.*?),?\s+N(?:\.\s*|\s+)([\w/-]+)\s*,?\s*(.*)$/i);
  if (!m) return { street: addr || null, number: null, complement: null };
  return { street: m[1]!.trim() || null, number: /^s\/?n$/i.test(m[2]!) ? null : m[2]!, complement: m[3]!.trim() || null };
}

function auctionTypeOf(mode: string): NormalizedListing["auctionType"] {
  const m = mode.toLowerCase();
  if (m.includes("leilão") || m.includes("leilao")) return "EXTRAJUDICIAL";
  if (m.includes("licitação") || m.includes("licitacao")) return "LICITACAO_ABERTA";
  return "DIRECT_SALE";
}

export function rowToListing(row: CaixaRow): NormalizedListing {
  const d = row.description;
  const price = parseBRL(row.price);
  const type = parsePropertyType(d.split(",")[0]);
  return NormalizedListingSchema.parse({
    externalId: row.id,
    url: row.link || detailUrl(row.id),
    title: `${d.split(",")[0] || "Imóvel"} em ${titleCaseCity(row.city) ?? ""}/${row.uf}${row.neighborhood ? ` - ${titleCaseCity(row.neighborhood)}` : ""}`,
    description: d,
    seller: "Caixa Econômica Federal",
    auctionType: auctionTypeOf(row.mode),
    status: "OPEN",
    appraisalValue: parseBRL(row.appraisal),
    minBid: price,
    acceptsFinancing: /^sim/i.test(row.financing),
    property: {
      type,
      ...splitAddress(row.address),
      neighborhood: titleCaseCity(row.neighborhood),
      city: titleCaseCity(row.city),
      uf: normalizeUf(row.uf),
      privateArea: pos(num(/([\d.]+)\s+de área privativa/i, d)),
      totalArea: pos(num(/([\d.]+)\s+de área total/i, d)),
      landArea: pos(num(/([\d.]+)\s+de área do terreno/i, d)),
      bedrooms: num(/(\d+)\s+qto/i, d),
      parking: num(/(\d+)\s+vaga/i, d),
    },
    rounds: [{ number: 1, minBid: price }],
  });
}

/** Enriquece com a página de detalhe: matrícula, CEP, praças (leilão SFI), edital, fotos, FGTS. */
export function enrichWithDetail(base: NormalizedListing, html: string): NormalizedListing {
  const $ = cheerio.load(html);
  $("script, style").remove();
  const text = $("body").text().replace(/\s+/g, " ");
  const field = (label: string) => text.match(new RegExp(`${label}:\\s*([^:]*?)(?=\\s+[A-ZÀ-Ú][\\wÀ-ú()./ ]{2,40}:|\\s+Área |$)`))?.[1]?.trim() || null;

  const registry = field("Matrícula\\(s\\)");
  const comarca = field("Comarca");
  const office = field("Ofício");
  const cep = text.match(/CEP:\s*([\d-]{8,9})/)?.[1];

  const rounds: NormalizedListing["rounds"] = [];
  for (const m of text.matchAll(/Valor mínimo de venda (\d)º Leilão:\s*R\$\s*([\d.,]+)/g)) {
    rounds.push({ number: Number(m[1]), minBid: parseBRL(m[2]), date: null });
  }
  for (const m of text.matchAll(/Data do (\d)º Leilão - ([\d/]+)\s*-\s*(\d{1,2})h(\d{2})/g)) {
    const n = Number(m[1]);
    const date = parseBRDateTime(`${m[2]} ${m[3]}:${m[4]}`);
    const r = rounds.find((x) => x.number === n);
    if (r) r.date = date; else rounds.push({ number: n, date, minBid: null });
  }
  rounds.sort((a, b) => a.number - b.number);

  const editalPath = [...html.matchAll(/ExibeDoc\('([^']+)'\)/g)].map((m) => m[1]!).find((p) => !/matricula/i.test(p));
  const images = [...new Set($("img[alt='Foto do imóvel']").map((_, el) => $(el).attr("src")).get().filter(Boolean))]
    .map((s) => new URL(s!, CAIXA_BASE).toString());
  const now = new Date();
  const next = rounds.map((r) => r.date).filter((d): d is Date => !!d && d > now);
  const accepts = /Permite utilização de FGTS/i.test(text);

  return NormalizedListingSchema.parse({
    ...base,
    noticeUrl: editalPath ? new URL(editalPath, CAIXA_BASE).toString() : base.noticeUrl,
    acceptsFgts: accepts,
    acceptsFinancing: base.acceptsFinancing || /financiamento/i.test(text.match(/FORMAS DE PAGAMENTO ACEITAS:(.*?)REGRAS/)?.[1] ?? ""),
    status: rounds.length && !next.length && rounds.some((r) => r.date) ? "CLOSED" : base.status,
    rounds: rounds.length ? rounds : base.rounds,
    images,
    property: {
      ...base.property,
      zip: normalizeZip(cep) ,
      registry,
      registryOffice: [office && `Ofício ${office}`, comarca].filter(Boolean).join(" - ") || null,
    },
  });
}
