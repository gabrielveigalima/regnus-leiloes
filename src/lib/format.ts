const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export const fmtBRL = (v: unknown) => (v == null ? "—" : brl.format(Number(v)));
export const fmtDate = (d: Date | null | undefined) => (d ? dt.format(d) : "—");
export const fmtM2 = (v: unknown) => (v == null || Number(v) <= 0 ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`);

export const TYPE_LABEL: Record<string, string> = { APARTMENT: "Apartamento", HOUSE: "Casa", LAND: "Terreno", COMMERCIAL: "Comercial", RURAL: "Rural", OTHER: "Outro" };
export const AUCTION_LABEL: Record<string, string> = { JUDICIAL: "Judicial", EXTRAJUDICIAL: "Extrajudicial", DIRECT_SALE: "Venda direta", LICITACAO_ABERTA: "Licitação aberta" };
export const STATUS_LABEL: Record<string, string> = { UPCOMING: "Em breve", OPEN: "Aberto", CLOSED: "Encerrado", SOLD: "Vendido", SUSPENDED: "Suspenso", CANCELLED: "Cancelado" };
export const OCC_LABEL: Record<string, string> = { OCCUPIED: "Ocupado", UNOCCUPIED: "Desocupado", UNKNOWN: "Não informado" };

type Num = number | string | { toString(): string } | null | undefined;

/** Preço por m² (lance mínimo ÷ área privativa, senão total, senão terreno); null sem preço/área. */
export function pricePerM2(minBid: Num, p: { privateArea?: Num; totalArea?: Num; landArea?: Num } | null | undefined): number | null {
  const bid = minBid == null ? 0 : Number(minBid);
  const area = [p?.privateArea, p?.totalArea, p?.landArea].map((a) => (a == null ? 0 : Number(a))).find((a) => a > 0);
  return bid > 0 && area ? bid / area : null;
}
export const fmtPricePerM2 = (v: number | null) => (v == null ? "—" : `${brl.format(v)}/m²`);

/** Dia civil em Brasília como número (UTC meia-noite do mesmo Y-M-D). */
function spDay(d: Date): number {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d).split("-").map(Number);
  return Date.UTC(y!, m! - 1, day!);
}

/** "hoje", "amanhã", "em N dias" (fuso de Brasília); null se não houver data ou já passou. */
export function fmtDaysUntil(date: Date | null | undefined, now = new Date()): string | null {
  if (!date) return null;
  const n = Math.round((spDay(date) - spDay(now)) / 86_400_000);
  if (n < 0) return null;
  return n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
}
