import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { discountPct } from "@/lib/normalize";
import { HttpClient, RobotsBlockedError } from "./http";
import type { Connector, CrawlContext, NormalizedListing } from "./connector";

export interface RunOptions { uf?: string; limit?: number; dryRun?: boolean }
export interface RunSummary { seen: number; created: number; updated: number; removed: number; errors: number; samples: NormalizedListing[] }

const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
const REMOVE_AFTER_MISSES = 2;

export async function runConnector(connector: Connector, opts: RunOptions = {}, http = new HttpClient()): Promise<RunSummary> {
  const sum: RunSummary = { seen: 0, created: 0, updated: 0, removed: 0, errors: 0, samples: [] };
  const logs: string[] = [];
  const ctx: CrawlContext = { http, filters: { uf: opts.uf, limit: opts.limit }, log: (m) => { logs.push(m); console.log(m); } };
  const full = !opts.limit && !opts.uf;
  const run = opts.dryRun ? null : await prisma.crawlRun.create({ data: { sourceId: connector.id, isFull: full } });
  const seenIds = new Set<string>();
  let status: "SUCCESS" | "PARTIAL" | "FAILED" | "BLOCKED" = "SUCCESS";

  try {
    for await (const ref of connector.discover(ctx)) {
      if (opts.limit && sum.seen >= opts.limit) break;
      try {
        const raw = connector.fetchDetail ? await connector.fetchDetail(ref, ctx) : { ref, body: ref.data };
        const item = connector.parse(raw);
        sum.seen++; seenIds.add(item.externalId);
        if (opts.dryRun) { sum.samples.push(item); continue; }
        const r = await upsertListing(connector.id, item);
        if (r === "created") sum.created++; else if (r === "updated") sum.updated++;
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
  };

  if (!existing) {
    const property = await prisma.property.create({ data: { ...item.property } });
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
