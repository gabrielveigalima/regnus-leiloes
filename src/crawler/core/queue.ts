import { prisma } from "@/lib/prisma";
import type { JobType, Prisma } from "@prisma/client";

const LEASE_MS = 5 * 60_000;

export async function enqueue(sourceId: string, type: JobType, payload?: Prisma.InputJsonValue, runAt = new Date()) {
  return prisma.crawlJob.create({ data: { sourceId, type, payload, runAt } });
}

/** Pega 1 job com lease (SELECT ... FOR UPDATE SKIP LOCKED, MySQL 8). */
export async function claimJob() {
  return prisma.$transaction(async (tx) => {
    // Data passada como parâmetro (UTC, como o Prisma grava); NOW() usaria o fuso do servidor MySQL.
    const now = new Date();
    // Duas consultas simples: com OR o MySQL varre/trava um intervalo e os workers se serializam.
    let rows = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM CrawlJob WHERE status = 'PENDING' AND runAt <= ${now}
      ORDER BY runAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED`;
    if (!rows[0]) {
      rows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM CrawlJob WHERE status = 'RUNNING' AND lockedUntil < ${now}
        ORDER BY runAt ASC LIMIT 1 FOR UPDATE SKIP LOCKED`; // lease expirado: worker anterior morreu
    }
    const id = rows[0]?.id;
    if (!id) return null;
    return tx.crawlJob.update({
      where: { id },
      data: { status: "RUNNING", attempts: { increment: 1 }, lockedUntil: new Date(Date.now() + LEASE_MS) },
    });
  });
}

export const completeJob = (id: string) =>
  prisma.crawlJob.update({ where: { id }, data: { status: "DONE", lockedUntil: null } });

/** Retry com backoff exponencial; FAILED após maxAttempts. */
export async function failJob(id: string, attempts: number, maxAttempts: number, error: string) {
  const dead = attempts >= maxAttempts;
  return prisma.crawlJob.update({
    where: { id },
    data: {
      status: dead ? "FAILED" : "PENDING", lockedUntil: null, lastError: error.slice(0, 5000),
      runAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** attempts)),
    },
  });
}
