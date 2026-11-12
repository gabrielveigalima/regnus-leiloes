import nodemailer from "nodemailer";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildWhere, parseFilters } from "./search";
import { allowedUfsFor } from "./access";
import { buildAlertEmail, type AlertItem } from "./alert-email";

export interface Mailer { send(msg: { to: string; subject: string; text: string; html: string }): Promise<void> }

const MAX_ITEMS = 25;
const DAILY_MS = 23 * 3600_000;

export function smtpMailer(): Mailer | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const t = nodemailer.createTransport({
    host, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  const from = process.env.SMTP_FROM ?? "Regnus Leilões <no-reply@regnus.local>";
  return { send: async (m) => { await t.sendMail({ from, ...m }); } };
}

export type SavedFilters = Record<string, string>;

/** Anúncios que casam com a busca e tiveram evento CREATED ou queda de preço desde `since`. */
export async function findAlertItems(filters: SavedFilters, since: Date, until: Date, scope?: { allowedUfs?: string[] | null }): Promise<{ items: AlertItem[]; total: number }> {
  const where: Prisma.ListingWhereInput = {
    AND: [
      buildWhere(parseFilters(filters), scope),
      { events: { some: { at: { gt: since, lte: until }, kind: { in: ["CREATED", "PRICE_CHANGE"] } } } },
    ],
  };
  const listings = await prisma.listing.findMany({
    where, take: 500, orderBy: { discountPct: { sort: "desc", nulls: "last" } },
    include: { property: true, source: { select: { name: true } }, events: { where: { at: { gt: since, lte: until } } } },
  });
  const all: AlertItem[] = [];
  for (const l of listings) {
    const created = l.events.some((e) => e.kind === "CREATED");
    const drop = l.events.find((e) => e.kind === "PRICE_CHANGE" && e.oldValue != null && e.newValue != null && Number(e.newValue) < Number(e.oldValue));
    if (!created && !drop) continue;
    all.push({
      id: l.id, propertyId: l.propertyId, title: l.title, city: l.property?.city ?? null, uf: l.property?.uf ?? null,
      minBid: l.minBid == null ? null : Number(l.minBid), discountPct: l.discountPct == null ? null : Number(l.discountPct),
      url: l.url, sourceName: l.source.name, kind: created ? "NEW" : "PRICE_DROP", oldBid: drop ? Number(drop.oldValue) : null,
    });
  }
  return { items: all.slice(0, MAX_ITEMS), total: all.length };
}

/** Roda os alertas devidos. Só avança lastRunAt quando o envio dá certo (ou não há nada a enviar). */
export async function runAlerts(opts: { mailer?: Mailer | null; now?: Date; appUrl?: string; log?: (m: string) => void } = {}) {
  const log = opts.log ?? console.log;
  const mailer = opts.mailer === undefined ? smtpMailer() : opts.mailer;
  const now = opts.now ?? new Date();
  const appUrl = (opts.appUrl ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const result = { searches: 0, sent: 0, skipped: 0, failed: 0 };

  const searches = await prisma.savedSearch.findMany({ include: { user: { select: { email: true } } } });
  for (const s of searches) {
    const since = s.lastRunAt ?? s.createdAt;
    if (s.frequency === "DAILY" && now.getTime() - since.getTime() < DAILY_MS) continue;
    result.searches++;
    try {
      const { items, total } = await findAlertItems(s.filters as SavedFilters, since, now, { allowedUfs: await allowedUfsFor(s.organizationId) });
      if (items.length === 0) { await prisma.savedSearch.update({ where: { id: s.id }, data: { lastRunAt: now } }); result.skipped++; continue; }
      if (!mailer) { log("alertas: SMTP_HOST não configurado; envio adiado"); result.skipped++; continue; }
      await mailer.send({ to: s.user.email, ...buildAlertEmail({ searchName: s.name, items, total, appUrl }) });
      await prisma.$transaction([
        prisma.alertDelivery.create({ data: { savedSearchId: s.id, listingIds: items.map((i) => i.id) } }),
        prisma.savedSearch.update({ where: { id: s.id }, data: { lastRunAt: now } }),
      ]);
      result.sent++;
    } catch (e) {
      result.failed++;
      log(`alertas: falha na busca ${s.id}: ${(e as Error).message}`);
    }
  }
  return result;
}
