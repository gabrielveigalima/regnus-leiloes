import type { Prisma } from "@prisma/client";

const n = (v: unknown) => (v == null ? null : Number(v));

type ListingFull = Prisma.ListingGetPayload<{ include: { source: { select: { id: true; name: true } }; rounds: true; images: true } }>;
type PropertyRow = Prisma.PropertyGetPayload<Record<string, never>>;

export function serializeProperty(p: PropertyRow) {
  return {
    id: p.id,
    type: p.type,
    address: { street: p.street, number: p.number, complement: p.complement, neighborhood: p.neighborhood, city: p.city, uf: p.uf, zip: p.zip },
    location: p.lat != null && p.lng != null ? { lat: n(p.lat), lng: n(p.lng), precision: p.geoPrecision } : null,
    areas_m2: { private: n(p.privateArea), total: n(p.totalArea), land: n(p.landArea) },
    bedrooms: p.bedrooms,
    parking: p.parking,
    occupation: p.occupation,
    registry: p.registry,
    registry_office: p.registryOffice,
  };
}

/** `source.url` é sempre incluído: o anúncio original deve ser linkado/atribuído por quem consome a API. */
export function serializeListing(l: ListingFull) {
  return {
    id: l.id,
    source: { id: l.source.id, name: l.source.name, url: l.url },
    external_id: l.externalId,
    title: l.title,
    seller: l.seller,
    auction_type: l.auctionType,
    status: l.status,
    appraisal_value: n(l.appraisalValue),
    min_bid: n(l.minBid),
    discount_pct: n(l.discountPct),
    next_auction_at: l.nextAuctionAt?.toISOString() ?? null,
    accepts_financing: l.acceptsFinancing,
    accepts_fgts: l.acceptsFgts,
    case_number: l.caseNumber,
    notice_url: l.noticeUrl,
    rounds: l.rounds.sort((a, b) => a.number - b.number).map((r) => ({ number: r.number, date: r.date?.toISOString() ?? null, min_bid: n(r.minBid) })),
    images: l.images.sort((a, b) => a.position - b.position).map((i) => i.url),
    first_seen_at: l.firstSeenAt.toISOString(),
    last_seen_at: l.lastSeenAt.toISOString(),
  };
}
