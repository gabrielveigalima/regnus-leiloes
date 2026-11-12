import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const num = z.preprocess((v) => (v === "" || v == null ? undefined : Number(String(v).replace(",", "."))), z.number().finite().nonnegative().optional());
const str = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined), z.string().max(100).optional());
const bool = z.preprocess((v) => (v === "1" || v === "true" ? true : undefined), z.literal(true).optional());
const list = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((v) => (v == null || v === "" ? undefined : Array.isArray(v) ? v : String(v).split(",")), z.array(item).max(10).optional());

export const SORTS = ["desconto", "preco", "praca", "recentes"] as const;

export const FiltersSchema = z.object({
  uf: str.transform((v) => v?.toUpperCase()).pipe(z.string().length(2).optional()),
  cidade: str, bairro: str, q: str, fonte: str,
  tipo: list(z.enum(["APARTMENT", "HOUSE", "LAND", "COMMERCIAL", "RURAL", "OTHER"])),
  leilao: list(z.enum(["JUDICIAL", "EXTRAJUDICIAL", "DIRECT_SALE", "LICITACAO_ABERTA"])),
  status: list(z.enum(["UPCOMING", "OPEN", "CLOSED", "SOLD", "SUSPENDED", "CANCELLED"])),
  ocupacao: z.enum(["OCCUPIED", "UNOCCUPIED", "UNKNOWN"]).optional().catch(undefined),
  precoMin: num, precoMax: num, descMin: num, areaMin: num, areaMax: num, quartos: num,
  financia: bool, fgts: bool,
  pracaAte: z.preprocess((v) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T23:59:59-03:00") : undefined), z.date().optional()),
  ordem: z.enum(SORTS).catch("desconto").default("desconto"),
  cursor: str,
});
export type Filters = z.infer<typeof FiltersSchema>;

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : v]));
  return FiltersSchema.parse(flat);
}

const range = (min?: number, max?: number) =>
  min != null || max != null ? { ...(min != null ? { gte: min } : {}), ...(max != null ? { lte: max } : {}) } : undefined;

export function buildWhere(f: Filters): Prisma.ListingWhereInput {
  const property: Prisma.PropertyWhereInput = {
    ...(f.uf ? { uf: f.uf } : {}),
    ...(f.cidade ? { city: { contains: f.cidade } } : {}),
    ...(f.bairro ? { neighborhood: { contains: f.bairro } } : {}),
    ...(f.tipo?.length ? { type: { in: f.tipo } } : {}),
    ...(f.ocupacao ? { occupation: f.ocupacao } : {}),
    ...(f.quartos != null ? { bedrooms: { gte: f.quartos } } : {}),
    ...(range(f.areaMin, f.areaMax) ? { privateArea: range(f.areaMin, f.areaMax) } : {}),
  };
  const and: Prisma.ListingWhereInput[] = [];
  if (f.q) {
    and.push({ OR: [
      { title: { contains: f.q } }, { description: { contains: f.q } },
      { property: { street: { contains: f.q } } }, { property: { neighborhood: { contains: f.q } } },
    ] });
  }
  return {
    status: { in: f.status?.length ? f.status : ["OPEN", "UPCOMING"] },
    ...(Object.keys(property).length ? { property } : {}),
    ...(f.fonte ? { sourceId: f.fonte } : {}),
    ...(f.leilao?.length ? { auctionType: { in: f.leilao } } : {}),
    ...(range(f.precoMin, f.precoMax) ? { minBid: range(f.precoMin, f.precoMax) } : {}),
    ...(f.descMin != null ? { discountPct: { gte: f.descMin } } : {}),
    ...(f.financia ? { acceptsFinancing: true } : {}),
    ...(f.fgts ? { acceptsFgts: true } : {}),
    ...(f.pracaAte ? { nextAuctionAt: { lte: f.pracaAte, gte: new Date() } } : {}),
    ...(and.length ? { AND: and } : {}),
  };
}

export function buildOrderBy(sort: Filters["ordem"]): Prisma.ListingOrderByWithRelationInput[] {
  switch (sort) {
    case "preco": return [{ minBid: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "praca": return [{ nextAuctionAt: { sort: "asc", nulls: "last" } }, { id: "asc" }];
    case "recentes": return [{ firstSeenAt: "desc" }, { id: "asc" }];
    default: return [{ discountPct: { sort: "desc", nulls: "last" } }, { id: "asc" }];
  }
}

export const PAGE_SIZE = 24;

export async function searchListings(f: Filters) {
  const where = buildWhere(f);
  const items = await prisma.listing.findMany({
    where, orderBy: buildOrderBy(f.ordem), take: PAGE_SIZE + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    include: { property: true, source: { select: { name: true } }, images: { orderBy: { position: "asc" }, take: 1 } },
  });
  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;
  const total = f.cursor ? null : await prisma.listing.count({ where });
  return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null, total };
}

export const MAP_LIMIT = 2000;

export interface MapPoint { id: string; propertyId: string; lat: number; lng: number; title: string; minBid: number | null; discountPct: number | null; precision: string | null }

/** Anúncios que casam com os filtros e têm coordenadas (para o mapa). */
export async function searchMapPoints(f: Filters) {
  const base = buildWhere(f);
  const where = { AND: [base, { property: { is: { lat: { not: null }, lng: { not: null } } } }] };
  const [rows, total, withoutCoords] = await Promise.all([
    prisma.listing.findMany({
      where, orderBy: buildOrderBy(f.ordem), take: MAP_LIMIT,
      select: { id: true, propertyId: true, title: true, minBid: true, discountPct: true, property: { select: { lat: true, lng: true, geoPrecision: true } } },
    }),
    prisma.listing.count({ where }),
    prisma.listing.count({ where: base }),
  ]);
  const points: MapPoint[] = rows.flatMap((r) =>
    r.propertyId && r.property?.lat != null && r.property.lng != null
      ? [{ id: r.id, propertyId: r.propertyId, lat: Number(r.property.lat), lng: Number(r.property.lng), title: r.title,
          minBid: r.minBid == null ? null : Number(r.minBid), discountPct: r.discountPct == null ? null : Number(r.discountPct), precision: r.property.geoPrecision }]
      : []);
  return { points, withCoords: total, total: withoutCoords };
}
