import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { discountPct } from "@/lib/normalize";
import { fingerprint, recordCandidates, reconcileProperty, resolveProperty, type PropLike } from "@/lib/dedup";
import { HttpClient, RobotsBlockedError } from "./http";
import type { Connector, CrawlContext, NormalizedListing } from "./connector";

export interface RunOptions {
  uf?: string; limit?: number; dryRun?: boolean;
  /** Só lê a página de detalhe do que ainda não foi detalhado (listing.detailAt nulo). Não conta para "removidos". */
  enrichOnly?: boolean;
}
export interface RunSummary { seen: number; created: number; updated: number; removed: number; errors: number; samples: NormalizedListing[] }

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const REMOVE_AFTER_MISSES = 2;

export async function runConnector(connector: Connector, opts: RunOptions = {}, http = new HttpClient()): Promise<RunSummary> {
  const sum: RunSummary = { seen: 0, created: 0, updated: 0, removed: 0, errors: 0, samples: [] };
  const logs: string[] = [];
  const ctx: CrawlContext = { http, filters: { uf: opts.uf, limit: opts.limit }, log: (m) => { logs.push(m); console.log(m); } };
  const full = !opts.limit && !opts.uf && !opts.enrichOnly;
  const detailed = opts.enrichOnly && !opts.dryRun
    ? new Set((await prisma.listing.findMany({ where: { sourceId: connector.id, detailAt: { not: null } }, select: { externalId: true } })).map((l) => l.externalId))
    : new Set<string>();
  let skipped = 0;
  const run = opts.dryRun ? null : await prisma.crawlRun.create({ data: { sourceId: connector.id, isFull: full } });
  const seenIds = new Set<string>();
  let status: "SUCCESS" | "PARTIAL" | "FAILED" | "BLOCKED" = "SUCCESS";

  try {
    for await (const ref of connector.discover(ctx)) {
      if (opts.limit && sum.seen >= opts.limit) break;
      if (detailed.has(ref.externalId)) { skipped++; continue; } // já detalhado
      try {
        const raw = connector.fetchDetail ? await connector.fetchDetail(ref, ctx) : { ref, body: ref.data };
        const item = connector.parse(raw);
        sum.seen++; seenIds.add(item.externalId);
        if (opts.dryRun) { sum.samples.push(item); continue; }
        const r = await upsertListing(connector.id, item);
        if (r === "created") sum.created++; else if (r === "updated") sum.updated++;
        if (opts.enrichOnly && sum.seen % 50 === 0) ctx.log(`enrich ${connector.id}: ${sum.seen} detalhados (${skipped} já estavam completos)`);
      } catch (e) {
        if (e instanceof RobotsBlockedError) throw e;
        sum.errors++; logs.push(`erro ${ref.externalId}: ${(e as Error).message}`);
      }
    }
    if (!opts.dryRun && full && sum.errors === 0) sum.removed = await markMissing(connector.id, seenIds);
    if (sum.errors > 0) status = "PARTIAL";
  } catch (e) {
    status = e instanceof RobotsBlockedError ? "BLOCKED" : "FAILED";
    logs.push((e as Error).message);
    if (!opts.dryRun) {
      await prisma.source.update({
        where: { id: connector.id },
        data: { lastErrorAt: new Date(), lastError: (e as Error).message.slice(0, 2000), blockedByRobots: status === "BLOCKED" },
      });
    }
  }

  if (run) {
    await prisma.crawlRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status, seen: sum.seen, created: sum.created, updated: sum.updated, removed: sum.removed, errors: sum.errors, log: logs.slice(-200).join("\n").slice(0, 60000) },
    });
    if (status === "SUCCESS" || status === "PARTIAL") {
      await prisma.source.update({ where: { id: connector.id }, data: { lastSuccessAt: new Date(), blockedByRobots: false } });
    }
  }
  return sum;
}

async function upsertListing(sourceId: string, item: NormalizedListing): Promise<"created" | "updated" | "same"> {
  const rawHash = hash(item);
  const key = { sourceId_externalId: { sourceId, externalId: item.externalId } };
  const existing = await prisma.listing.findUnique({ where: key });
  const now = new Date();
  const nextRound = item.rounds.map((r) => r.date).filter((d): d is Date => !!d && d > now).sort((a, b) => +a - +b)[0] ?? null;
  const data = {
    url: item.url, title: item.title, description: item.description ?? null, seller: item.seller ?? null,
    auctionType: item.auctionType, status: item.status, appraisalValue: item.appraisalValue ?? null,
    minBid: item.minBid ?? null, discountPct: discountPct(item.appraisalValue ?? null, item.minBid ?? null),
    caseNumber: item.caseNumber ?? null, noticeUrl: item.noticeUrl ?? null,
    acceptsFinancing: item.acceptsFinancing, acceptsFgts: item.acceptsFgts, nextAuctionAt: nextRound,
    rawHash, lastSeenAt: now, missedRuns: 0,
    ...(item.detail ? { detailAt: now } : {}),
  };

  if (!existing) {
    const incoming: PropLike = {
      type: item.property.type, street: item.property.street ?? null, number: item.property.number ?? null, complement: item.property.complement ?? null,
      city: item.property.city ?? null, uf: item.property.uf ?? null, zip: item.property.zip ?? null, registry: item.property.registry ?? null,
      registryOffice: item.property.registryOffice ?? null, privateArea: (item.property.privateArea ?? null) as never,
      totalArea: (item.property.totalArea ?? null) as never, landArea: (item.property.landArea ?? null) as never,
    };
    // Mesmo bem em outra fonte? Funde só com alta confiança; o resto vai para revisão manual.
    const match = await resolveProperty(incoming, sourceId);
    const property = match.propertyId
      ? await prisma.property.findUniqueOrThrow({ where: { id: match.propertyId } })
      : await prisma.property.create({ data: { ...item.property, fingerprint: fingerprint(incoming), geocodedAt: item.property.lat != null ? new Date() : undefined } });
    if (match.propertyId) await fillMissing(property.id, item.property);
    else if (match.candidates.length) await recordCandidates(property.id, match.candidates);
    await prisma.listing.create({
      data: {
        sourceId, externalId: item.externalId, propertyId: property.id, ...data,
        rounds: { create: item.rounds.map((r) => ({ number: r.number, date: r.date ?? null, minBid: r.minBid ?? null })) },
        images: { create: item.images.map((url, position) => ({ url, position })) },
        events: { create: { kind: "CREATED", newValue: String(item.minBid ?? "") } },
      },
    });
    return "created";
  }
  // Coleta só da listagem sobre um anúncio já detalhado: atualiza apenas o preço e a presença. Status, praças, datas, fotos
  // e dados do imóvel vêm do detalhe e não podem ser desfeitos (nem gerar eventos falsos) por uma listagem mais pobre.
  if (!item.detail && existing.detailAt) {
    const priceChanged = String(existing.minBid ?? "") !== String(item.minBid ?? "") && item.minBid != null;
    await prisma.listing.update({
      where: key,
      data: {
        lastSeenAt: now, missedRuns: 0,
        ...(priceChanged ? {
          minBid: item.minBid, discountPct: discountPct(existing.appraisalValue == null ? null : Number(existing.appraisalValue), item.minBid ?? null),
          events: { create: { kind: "PRICE_CHANGE", oldValue: existing.minBid?.toString() ?? null, newValue: item.minBid?.toString() ?? null } },
        } : {}),
      },
    });
    return priceChanged ? "updated" : "same";
  }
  if (existing.rawHash === rawHash) {
    await prisma.listing.update({ where: key, data: { lastSeenAt: now, missedRuns: 0 } });
    return "same";
  }
  const events: { kind: string; oldValue: string | null; newValue: string | null }[] = [];
  if (String(existing.minBid ?? "") !== String(item.minBid ?? "")) events.push({ kind: "PRICE_CHANGE", oldValue: existing.minBid?.toString() ?? null, newValue: item.minBid?.toString() ?? null });
  if (existing.status !== item.status) events.push({ kind: "STATUS_CHANGE", oldValue: existing.status, newValue: item.status });
  if (existing.nextAuctionAt?.getTime() !== nextRound?.getTime()) events.push({ kind: "DATE_CHANGE", oldValue: existing.nextAuctionAt?.toISOString() ?? null, newValue: nextRound?.toISOString() ?? null });
  // Coletas sem detalhe não podem apagar dados já enriquecidos (praças com data, imagens, matrícula).
  const [oldRounds, imageCount] = await Promise.all([
    prisma.auctionRound.findMany({ where: { listingId: existing.id } }),
    prisma.listingImage.count({ where: { listingId: existing.id } }),
  ]);
  const keepRounds = oldRounds.some((r) => r.date) && !item.rounds.some((r) => r.date);
  const oldProp = existing.propertyId ? await prisma.property.findUnique({ where: { id: existing.propertyId }, select: { registry: true, zip: true } }) : null;
  const propData = Object.fromEntries(Object.entries(item.property).filter(([, v]) => v != null && v !== "UNKNOWN"));
  await prisma.$transaction([
    prisma.listing.update({ where: key, data: keepRounds ? { ...data, nextAuctionAt: existing.nextAuctionAt } : data }),
    ...(existing.propertyId ? [prisma.property.update({ where: { id: existing.propertyId }, data: propData })] : []),
    ...(keepRounds ? [] : [
      prisma.auctionRound.deleteMany({ where: { listingId: existing.id } }),
      prisma.auctionRound.createMany({ data: item.rounds.map((r) => ({ listingId: existing.id, number: r.number, date: r.date ?? null, minBid: r.minBid ?? null })) }),
    ]),
    ...(imageCount === 0 && item.images.length ? [prisma.listingImage.createMany({ data: item.images.map((url, position) => ({ listingId: existing.id, url, position })) })] : []),
    prisma.listingEvent.createMany({ data: events.map((e) => ({ ...e, listingId: existing.id })) }),
  ]);
  // Matrícula/CEP recém-descobertos podem revelar o mesmo imóvel em outra fonte.
  if (existing.propertyId && oldProp && ((!oldProp.registry && item.property.registry) || (!oldProp.zip && item.property.zip))) {
    await reconcileProperty(existing.propertyId, sourceId);
  }
  return "updated";
}

/** Marca como CLOSED o que não apareceu em 2 coletas completas seguidas. */
async function markMissing(sourceId: string, seen: Set<string>): Promise<number> {
  const open = await prisma.listing.findMany({ where: { sourceId, status: { in: ["OPEN", "UPCOMING"] } }, select: { id: true, externalId: true, missedRuns: true } });
  let removed = 0;
  for (const l of open) {
    if (seen.has(l.externalId)) continue;
    if (l.missedRuns + 1 >= REMOVE_AFTER_MISSES) {
      await prisma.listing.update({ where: { id: l.id }, data: { status: "CLOSED", missedRuns: l.missedRuns + 1, events: { create: { kind: "REMOVED", oldValue: "OPEN", newValue: "CLOSED" } } } });
      removed++;
    } else await prisma.listing.update({ where: { id: l.id }, data: { missedRuns: l.missedRuns + 1 } });
  }
  return removed;
}

/** Completa campos vazios do imóvel canônico com dados de uma nova fonte (nunca sobrescreve). */
async function fillMissing(propertyId: string, incoming: NormalizedListing["property"]) {
  const current = await prisma.property.findUniqueOrThrow({ where: { id: propertyId } }) as unknown as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) if (v != null && v !== "UNKNOWN" && v !== "OTHER" && current[k] == null) data[k] = v;
  if (Object.keys(data).length) await prisma.property.update({ where: { id: propertyId }, data });
}
