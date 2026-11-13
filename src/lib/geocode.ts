import { request } from "undici";
import { prisma } from "./prisma";
import { normalizeText } from "./normalize";

export type Precision = "ADDRESS" | "STREET" | "CITY";
export interface GeoQuery { street?: string | null; number?: string | null; neighborhood?: string | null; city?: string | null; uf?: string | null; zip?: string | null }
export interface GeoResult { lat: number; lng: number }
export interface GeocodeProvider { name: string; geocode(q: GeoQuery): Promise<GeoResult | null> }

/** Tentativas da mais precisa para a menos precisa. Cidade só como último recurso (marcada como CITY). */
export function buildAttempts(p: GeoQuery): { precision: Precision; query: GeoQuery }[] {
  const out: { precision: Precision; query: GeoQuery }[] = [];
  const base = { city: p.city, uf: p.uf };
  if (!p.city || !p.uf) return out;
  if (p.street && p.number) out.push({ precision: "ADDRESS", query: { ...base, street: p.street, number: p.number, zip: p.zip } });
  if (p.street) out.push({ precision: "STREET", query: { ...base, street: p.street } });
  out.push({ precision: "CITY", query: base });
  return out;
}

export const cacheKey = (provider: string, q: GeoQuery) =>
  `${provider}|${[q.street, q.number, q.zip, q.city, q.uf].map((x) => normalizeText(x ?? "")).join("|")}`.slice(0, 300);

/** Resultado fora do Brasil é descartado (erro típico de geocodificadores com nomes ambíguos). */
export const inBrazil = (r: GeoResult) => r.lat > -34 && r.lat < 6 && r.lng > -74 && r.lng < -34;

/** Nominatim/OSM. Política de uso: ≤1 req/s, User-Agent identificável, cache obrigatório. */
export class NominatimProvider implements GeocodeProvider {
  name = "nominatim";
  private next = 0;
  constructor(private baseUrl = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org",
              private minIntervalMs = Number(process.env.NOMINATIM_MIN_INTERVAL_MS ?? 1100)) {}

  async geocode(q: GeoQuery): Promise<GeoResult | null> {
    const wait = this.next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.next = Date.now() + this.minIntervalMs;
    const u = new URL("/search", this.baseUrl);
    u.searchParams.set("format", "jsonv2"); u.searchParams.set("limit", "1"); u.searchParams.set("countrycodes", "br");
    if (q.street) u.searchParams.set("street", [q.number, q.street].filter(Boolean).join(" "));
    if (q.city) u.searchParams.set("city", q.city);
    if (q.uf) u.searchParams.set("state", q.uf);
    if (q.zip && q.street) u.searchParams.set("postalcode", q.zip);
    const res = await request(u, {
      headers: { "user-agent": process.env.CRAWLER_USER_AGENT ?? "RegnusBot/1.0 (+https://regnus.com.br/bot)" },
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.body.text();
    if (res.statusCode === 429 || res.statusCode >= 500) throw new Error(`Nominatim HTTP ${res.statusCode}`);
    if (res.statusCode !== 200) return null;
    const first = (JSON.parse(body) as { lat: string; lon: string }[])[0];
    if (!first) return null;
    const r = { lat: Number(first.lat), lng: Number(first.lon) };
    return Number.isFinite(r.lat) && Number.isFinite(r.lng) && inBrazil(r) ? r : null;
  }
}

/** Geocodifica um lote de imóveis ainda não tentados. Fora do caminho da coleta; roda no worker/CLI. */
export async function geocodeBatch(opts: { limit?: number; provider?: GeocodeProvider; log?: (m: string) => void; filter?: import("@prisma/client").Prisma.PropertyWhereInput; deadline?: number } = {}) {
  const provider = opts.provider ?? new NominatimProvider();
  const log = opts.log ?? (() => {});
  const props = await prisma.property.findMany({
    where: { geocodedAt: null, lat: null, city: { not: null }, uf: { not: null }, ...opts.filter },
    // Imóveis com endereço completo primeiro (melhor resultado e mais úteis no mapa)
    orderBy: [{ number: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    take: opts.limit ?? 20,
  });
  const stats = { processed: 0, address: 0, street: 0, city: 0, failed: 0, cacheHits: 0 };
  for (const p of props) {
    if (opts.deadline && Date.now() > opts.deadline) break;
    let found: { r: GeoResult; precision: Precision } | null = null;
    for (const a of buildAttempts(p)) {
      const key = cacheKey(provider.name, a.query);
      const cached = await prisma.geocodeCache.findUnique({ where: { key } });
      let r: GeoResult | null;
      if (cached) {
        stats.cacheHits++;
        r = cached.lat != null && cached.lng != null ? { lat: Number(cached.lat), lng: Number(cached.lng) } : null;
      } else {
        r = await provider.geocode(a.query); // erro transitório propaga: não grava cache negativo nem marca tentativa
        await prisma.geocodeCache.create({ data: { key, lat: r?.lat ?? null, lng: r?.lng ?? null, provider: provider.name } }).catch(() => {});
      }
      if (r) { found = { r, precision: a.precision }; break; }
    }
    await prisma.property.update({
      where: { id: p.id },
      data: found
        ? { lat: found.r.lat, lng: found.r.lng, geoPrecision: found.precision, geocodedAt: new Date() }
        : { geocodedAt: new Date() },
    });
    stats.processed++;
    if (found) stats[found.precision.toLowerCase() as "address" | "street" | "city"]++; else stats.failed++;
    log(`geocode ${p.id}: ${found ? found.precision : "sem resultado"}`);
  }
  return stats;
}
