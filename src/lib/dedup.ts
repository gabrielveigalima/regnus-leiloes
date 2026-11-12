import { createHash } from "node:crypto";
import type { Property } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizeText } from "./normalize";

export type PropLike = Pick<Property, "type" | "street" | "number" | "complement" | "city" | "uf" | "zip" | "registry" | "registryOffice" | "privateArea" | "totalArea" | "landArea">;
type Num = number | { toString(): string } | null | undefined;
const n = (v: Num) => (v == null ? null : Number(v));

export const AUTO_MERGE = 0.92;
export const CANDIDATE_MIN = 0.75;

// ---------- normalização ----------
export const registryKey = (r: string | null | undefined) => (r ?? "").replace(/\D/g, "").replace(/^0+/, "") || null;
const officeKey = (o: string | null | undefined) => (o ?? "").match(/\d+/)?.[0]?.replace(/^0+/, "") || null;

export function normComplement(c: string | null | undefined): string {
  return normalizeText(c ?? "")
    .replace(/\b(apto|apt|apartamento|ap)\b/g, "ap").replace(/\b(bloco|bl)\b/g, "bl")
    .replace(/\b(lote|lt|lts)\b/g, "lt").replace(/\b(quadra|qd)\b/g, "qd")
    .replace(/\b0+(\d)/g, "$1").replace(/\s+/g, " ").trim();
}
const normNumber = (x: string | null | undefined) => (x ?? "").toLowerCase().replace(/\s+/g, "").replace(/^0+(\d)/, "$1") || null;

/** Hash de dedup: CEP + número + complemento. Só existe quando CEP e número são conhecidos. */
export function fingerprint(p: Pick<PropLike, "zip" | "number" | "complement">): string | null {
  const zip = (p.zip ?? "").replace(/\D/g, "");
  const num = normNumber(p.number);
  if (zip.length !== 8 || !num) return null;
  return createHash("sha1").update(`${zip}|${num}|${normComplement(p.complement)}`).digest("hex");
}

// ---------- similaridade ----------
function trigrams(s: string): Set<string> {
  const t = `  ${s} `;
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}
/** Coeficiente de Dice sobre trigramas (0..1). */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const A = trigrams(a), B = trigrams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export interface PairScore { score: number; reason: string; auto: boolean }

function areaMatch(a: PropLike, b: PropLike): "match" | "mismatch" | "unknown" {
  for (const k of ["privateArea", "totalArea", "landArea"] as const) {
    const x = n(a[k]), y = n(b[k]);
    if (x && y && x > 0 && y > 0) return Math.abs(x - y) / Math.max(x, y) <= 0.05 ? "match" : "mismatch";
  }
  return "unknown";
}

/** Pontua se dois imóveis são o mesmo bem. `null` = não relacionados. Não mescla sozinho: ver `auto`. */
export function scorePair(a: PropLike, b: PropLike): PairScore | null {
  const sameCity = !!a.city && !!b.city && !!a.uf && a.uf === b.uf && normalizeText(a.city) === normalizeText(b.city);

  // (a) matrícula + cartório/cidade
  const ra = registryKey(a.registry), rb = registryKey(b.registry);
  if (ra && ra === rb && sameCity) {
    const oa = officeKey(a.registryOffice), ob = officeKey(b.registryOffice);
    if (oa && ob) return oa === ob ? { score: 1, reason: "Mesma matrícula e ofício", auto: true } : null;
    return { score: 0.85, reason: "Mesma matrícula e cidade (ofício não confirmado)", auto: false };
  }

  // (b) CEP + número + complemento
  const fa = fingerprint(a), fb = fingerprint(b);
  if (fa && fa === fb) return { score: 0.97, reason: "Mesmo CEP, número e complemento", auto: true };

  // (c) similaridade de endereço na mesma cidade
  if (!sameCity) return null;
  if (a.type !== b.type && a.type !== "OTHER" && b.type !== "OTHER") return null;
  const na = normNumber(a.number), nb = normNumber(b.number);
  if (!na || na !== nb) return null;
  const sim = trigramSimilarity(normalizeText(a.street), normalizeText(b.street));
  if (sim < 0.75) return null;
  const area = areaMatch(a, b);
  if (area === "mismatch") return null;
  const ca = normComplement(a.complement), cb = normComplement(b.complement);
  const compOk = ca === cb; // iguais ou ambos vazios
  if (ca && cb && ca !== cb) return null; // unidades diferentes no mesmo prédio
  const score = Math.round((0.6 * sim + 0.2 + (area === "match" ? 0.1 : 0) + (compOk ? 0.1 : 0)) * 1000) / 1000;
  if (score < CANDIDATE_MIN) return null;
  const parts = [`Endereço ${Math.round(sim * 100)}% similar`, area === "match" ? "área compatível" : "área desconhecida", compOk ? "" : "complemento ausente em um dos lados"].filter(Boolean);
  return { score, reason: parts.join(", "), auto: score >= AUTO_MERGE && area === "match" && compOk };
}

// ---------- banco ----------
export interface Resolution { propertyId: string | null; candidates: { propertyId: string; score: number; reason: string }[] }

/**
 * Procura o imóvel canônico para `incoming`. Só devolve `propertyId` (fusão automática) quando a confiança é alta
 * e a fonte ainda não tem outro anúncio ativo nesse imóvel; o resto vira candidato para revisão manual.
 */
export async function resolveProperty(incoming: PropLike, sourceId: string, excludeId?: string): Promise<Resolution> {
  const where: import("@prisma/client").Prisma.PropertyWhereInput = { id: excludeId ? { not: excludeId } : undefined };
  const or: import("@prisma/client").Prisma.PropertyWhereInput[] = [];
  const reg = registryKey(incoming.registry);
  if (reg && incoming.city && incoming.uf) or.push({ uf: incoming.uf, city: incoming.city, registry: { not: null } });
  const fp = fingerprint(incoming);
  if (fp) or.push({ fingerprint: fp });
  if (incoming.city && incoming.uf && incoming.number) or.push({ uf: incoming.uf, city: incoming.city, number: incoming.number });
  if (or.length === 0) return { propertyId: null, candidates: [] };

  const pool = await prisma.property.findMany({
    where: { ...where, OR: or }, take: 300,
    include: { listings: { where: { sourceId, status: { in: ["OPEN", "UPCOMING"] } }, select: { id: true }, take: 1 } },
  });
  const scored = pool
    .map((p) => ({ p, s: scorePair(incoming, p) }))
    .filter((x): x is { p: (typeof pool)[number]; s: PairScore } => !!x.s)
    .sort((a, b) => b.s.score - a.s.score);

  const best = scored[0];
  const autoPick = best && best.s.auto && best.p.listings.length === 0 ? best : null;
  const candidates = scored
    .filter((x) => x !== autoPick)
    .slice(0, 5)
    .map((x) => ({ propertyId: x.p.id, score: x.s.score, reason: x.p.listings.length && x.s.auto ? `${x.s.reason} (mesma fonte já tem anúncio ativo)` : x.s.reason }));
  return { propertyId: autoPick?.p.id ?? null, candidates };
}

export const orderPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);

/** Registra pares para revisão (idempotente; pares já rejeitados/mesclados não são recriados). */
export async function recordCandidates(propertyId: string, candidates: Resolution["candidates"]) {
  for (const c of candidates) {
    const [a, b] = orderPair(propertyId, c.propertyId);
    await prisma.duplicateCandidate.upsert({
      where: { propertyAId_propertyBId: { propertyAId: a, propertyBId: b } },
      update: {}, create: { propertyAId: a, propertyBId: b, score: c.score, reason: c.reason.slice(0, 200) },
    });
  }
}

const FILLABLE = ["street", "number", "complement", "neighborhood", "city", "uf", "zip", "lat", "lng", "geoPrecision", "geocodedAt", "privateArea", "totalArea", "landArea", "bedrooms", "parking", "registry", "registryOffice"] as const;

/** Une `dropId` em `keepId`: move anúncios e favoritos, completa campos vazios e remove o duplicado. */
export async function mergeProperties(keepId: string, dropId: string, resolvedBy?: string) {
  if (keepId === dropId) throw new Error("Mesmo imóvel");
  await prisma.$transaction(async (tx) => {
    const [keep, drop] = await Promise.all([tx.property.findUniqueOrThrow({ where: { id: keepId } }), tx.property.findUniqueOrThrow({ where: { id: dropId } })]);
    const fill: Record<string, unknown> = {};
    for (const k of FILLABLE) if (keep[k] == null && drop[k] != null) fill[k] = drop[k];
    if (keep.occupation === "UNKNOWN" && drop.occupation !== "UNKNOWN") fill.occupation = drop.occupation;
    if (keep.type === "OTHER" && drop.type !== "OTHER") fill.type = drop.type;

    await tx.listing.updateMany({ where: { propertyId: dropId }, data: { propertyId: keepId } });
    // favoritos: se a mesma org/usuário já favoritou o outro, descarta o duplicado
    const keepFavs = await tx.favorite.findMany({ where: { propertyId: keepId }, select: { organizationId: true, userId: true } });
    for (const f of keepFavs) await tx.favorite.deleteMany({ where: { propertyId: dropId, organizationId: f.organizationId, userId: f.userId } });
    await tx.favorite.updateMany({ where: { propertyId: dropId }, data: { propertyId: keepId } });

    const [a, b] = orderPair(keepId, dropId);
    await tx.duplicateCandidate.updateMany({ where: { propertyAId: a, propertyBId: b }, data: { status: "MERGED", resolvedAt: new Date(), resolvedBy } });
    await tx.property.delete({ where: { id: dropId } }); // candidatos que o citam saem por cascade
    const merged = { ...keep, ...fill } as Property;
    await tx.property.update({ where: { id: keepId }, data: { ...fill, fingerprint: fingerprint(merged) } });
  });
}

export async function rejectCandidate(id: string, resolvedBy?: string) {
  await prisma.duplicateCandidate.update({ where: { id }, data: { status: "REJECTED", resolvedAt: new Date(), resolvedBy } });
}

/** Após enriquecimento (matrícula/CEP novos), reavalia o imóvel: funde se seguro, senão registra candidatos. */
export async function reconcileProperty(propertyId: string, sourceId: string): Promise<"merged" | "candidates" | "none"> {
  const p = await prisma.property.findUnique({ where: { id: propertyId } });
  if (!p) return "none";
  const fp = fingerprint(p);
  if (fp !== p.fingerprint) await prisma.property.update({ where: { id: p.id }, data: { fingerprint: fp } });
  const r = await resolveProperty(p, sourceId, p.id);
  if (r.propertyId) {
    // mantém o mais antigo
    const other = await prisma.property.findUniqueOrThrow({ where: { id: r.propertyId } });
    const [keep, drop] = other.createdAt <= p.createdAt ? [other.id, p.id] : [p.id, other.id];
    await mergeProperties(keep, drop);
    return "merged";
  }
  if (r.candidates.length) { await recordCandidates(p.id, r.candidates); return "candidates"; }
  return "none";
}
