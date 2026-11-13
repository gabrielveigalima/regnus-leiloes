import { NormalizedListingSchema, type NormalizedListing } from "../../core/connector";
import { normalizeUf, normalizeZip, parsePropertyType, titleCaseCity } from "@/lib/normalize";

export const VG_SITE = "https://imoveis.vendasgov.serpro.gov.br";
export const VG_API = `${VG_SITE}/api`;
export const PAGE_SIZE = 100;
export const listUrl = (page: number) => `${VG_API}/direct/imoveis?page=${page}&size=${PAGE_SIZE}`;
export const detailApiUrl = (id: number | string) => `${VG_API}/public/imoveis/${id}`;
export const portalUrl = (id: number | string) => `${VG_SITE}/imovel/${id}`;

export interface VgList { content: number[]; totalElements: number; totalPages: number }
export const parseList = (body: string): VgList => JSON.parse(body) as VgList;

interface VgItem { id: number; ativo?: boolean | null; valorImovel?: number | null; numeroItem?: string | null;
  edital?: { numero?: string; dtCertame?: string | null; dtPublicacao?: string | null; arquivoEdital?: string | null } | null }
export interface VgDetail {
  id: number; descricao?: string | null; observacoes?: string | null; matricula?: string | null; cartorio?: string | null;
  latitude?: string | null; longitude?: string | null; areaConstruida?: number | null; areaTerreno?: number | null;
  valorItemEdital?: number | null; ocupacao?: { nome?: string } | string | null;
  tipo?: { nome?: string } | null; sala?: { subtipo?: string } | null; estagioAlienacao?: { nomeMaquina?: string } | null;
  endereco?: { estado?: string; cidade?: string; bairro?: string; cep?: string; logradouro?: string; numero?: string; complemento?: string } | null;
  avaliacao?: { valorEdital?: number | null } | null; superintendencia?: { nomeOrgao?: string; orgao?: { nome?: string } } | null;
  entidadeProprietaria?: { nome?: string } | null; itens?: VgItem[] | null;
  fotos?: { src?: string; capa?: boolean; ordem?: number }[] | null;
}

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** Maior data de certame entre os itens de edital (o certame mais recente/próximo). */
export function latestCertame(d: VgDetail): { date: Date | null; value: number | null; notice: string | null } {
  let best: VgItem | null = null, bestT = -Infinity;
  for (const it of d.itens ?? []) {
    const t = it.edital?.dtCertame ? Date.parse(it.edital.dtCertame + "-03:00") : NaN;
    if (Number.isFinite(t) && t > bestT) { bestT = t; best = it; }
  }
  return { date: best ? new Date(bestT) : null, value: best?.valorImovel ?? null, notice: best?.edital?.arquivoEdital ?? null };
}

/** Define se o imóvel está (ou estará) à venda e em que modalidade. `null` = fora de venda. */
export function classify(d: VgDetail, now = new Date()): { status: NormalizedListing["status"]; auctionType: NormalizedListing["auctionType"]; nextDate: Date | null } | null {
  const sala = d.sala?.subtipo ?? "";
  const { date } = latestCertame(d);
  const future = date && date.getTime() > now.getTime() ? date : null;
  switch (sala) {
    case "venda": return { status: "OPEN", auctionType: "DIRECT_SALE", nextDate: null };
    case "autorizados": return { status: "UPCOMING", auctionType: "LICITACAO_ABERTA", nextDate: future };
    case "concorrencia": case "leilao":
      // Só entra com certame futuro ou muito recente; edital antigo sem desfecho é dado velho do portal.
      if (future) return { status: "UPCOMING", auctionType: "LICITACAO_ABERTA", nextDate: future };
      if (date && now.getTime() - date.getTime() < 30 * 86_400_000) return { status: "OPEN", auctionType: "LICITACAO_ABERTA", nextDate: null };
      return null;
    default: return null; // emProcesso, vendido, pai, fundo…
  }
}

export function parseDetail(d: VgDetail, now = new Date()): NormalizedListing | null {
  const c = classify(d, now);
  if (!c) return null;
  const e = d.endereco ?? {};
  const cert = latestCertame(d);
  const value = d.valorItemEdital ?? cert.value ?? d.avaliacao?.valorEdital ?? null;
  const street = clean((e.logradouro ?? "").replace(/\s*-?\s*CEP:?\s*[\d.-]+.*$/i, ""));
  const office = d.cartorio?.match(/(\d+)\s*[º°ª]?\s*Of[ií]cio/i)?.[1];
  const lat = Number(d.latitude), lng = Number(d.longitude);
  const geo = Number.isFinite(lat) && Number.isFinite(lng) && lat > -34 && lat < 6 && lng > -74 && lng < -34;
  const type = parsePropertyType(d.tipo?.nome);
  const city = titleCaseCity(e.cidade ?? null), uf = normalizeUf(e.estado ?? null);
  const orgao = d.superintendencia?.orgao?.nome ?? d.superintendencia?.nomeOrgao ?? d.entidadeProprietaria?.nome ?? null;
  const occ = typeof d.ocupacao === "string" ? d.ocupacao : d.ocupacao?.nome ?? "";
  const photos = [...(d.fotos ?? [])].sort((a, b) => (b.capa ? 1 : 0) - (a.capa ? 1 : 0) || (a.ordem ?? 0) - (b.ordem ?? 0))
    .flatMap((f) => (f.src ? [`${VG_API}${f.src}`] : [])).slice(0, 10);

  return NormalizedListingSchema.parse({
    detail: true,
    externalId: String(d.id),
    url: portalUrl(d.id),
    title: `${d.tipo?.nome ?? "Imóvel"} em ${city ?? ""}/${uf ?? ""}${e.bairro ? ` - ${e.bairro}` : ""}`,
    description: clean(d.descricao) || clean(d.observacoes) || null,
    seller: orgao,
    auctionType: c.auctionType,
    status: c.status,
    appraisalValue: d.avaliacao?.valorEdital ?? null,
    minBid: value,
    noticeUrl: cert.notice ? `${VG_API}${cert.notice}` : null,
    property: {
      type, street: street || null, number: e.numero || null, complement: e.complemento || null, neighborhood: e.bairro || null,
      city, uf, zip: normalizeZip(e.cep ?? null),
      ...(geo ? { lat, lng, geoPrecision: "SOURCE" } : {}),
      privateArea: d.areaConstruida ?? null, landArea: d.areaTerreno ?? null,
      registry: d.matricula || null, registryOffice: office ? `Ofício ${office}` : null,
      occupation: /desocup|livre|vago/i.test(occ) ? "UNOCCUPIED" : /ocupad/i.test(occ) ? "OCCUPIED" : "UNKNOWN",
    },
    rounds: c.nextDate || value != null ? [{ number: 1, date: c.nextDate, minBid: value }] : [],
    images: photos,
  });
}
