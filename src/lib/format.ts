const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

export const fmtBRL = (v: unknown) => (v == null ? "—" : brl.format(Number(v)));
export const fmtDate = (d: Date | null | undefined) => (d ? dt.format(d) : "—");
export const fmtM2 = (v: unknown) => (v == null || Number(v) <= 0 ? "—" : `${Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m²`);

export const TYPE_LABEL: Record<string, string> = { APARTMENT: "Apartamento", HOUSE: "Casa", LAND: "Terreno", COMMERCIAL: "Comercial", RURAL: "Rural", OTHER: "Outro" };
export const AUCTION_LABEL: Record<string, string> = { JUDICIAL: "Judicial", EXTRAJUDICIAL: "Extrajudicial", DIRECT_SALE: "Venda direta", LICITACAO_ABERTA: "Licitação aberta" };
export const STATUS_LABEL: Record<string, string> = { UPCOMING: "Em breve", OPEN: "Aberto", CLOSED: "Encerrado", SOLD: "Vendido", SUSPENDED: "Suspenso", CANCELLED: "Cancelado" };
export const OCC_LABEL: Record<string, string> = { OCCUPIED: "Ocupado", UNOCCUPIED: "Desocupado", UNKNOWN: "Não informado" };
