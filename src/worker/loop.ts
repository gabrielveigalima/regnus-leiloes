import { prisma } from "@/lib/prisma";
import { claimJob, completeJob, enqueue, failJob } from "@/crawler/core/queue";
import { runConnector } from "@/crawler/core/runner";
import { connectors } from "@/crawler/registry";
import { runAlerts } from "@/lib/alerts";
import { geocodeBatch } from "@/lib/geocode";

/** Agenda FULL_SYNC das fontes ativas vencidas e consome a fila até acabar o tempo (maxMs) ou para sempre. */
export async function runWorker({ maxMs, onLoop }: { maxMs?: number; onLoop?: () => void }) {
  let lastIdleAlerts = 0;
  const deadline = maxMs ? Date.now() + maxMs : Infinity;
  while (Date.now() < deadline) {
    onLoop?.();
    await scheduleDue();
    const job = await claimJob();
    if (!job) {
      if (maxMs || Date.now() - lastIdleAlerts > 5 * 60_000) {
        lastIdleAlerts = Date.now();
        await runAlerts().catch((e) => console.error("alertas:", e));
      }
      if (process.env.GEOCODE === "1") {
        const g = await geocodeBatch({ limit: 20 }).catch((e) => { console.error("geocode:", e.message); return null; });
        if (g && g.processed > 0) continue; // ainda há imóveis na fila de geocodificação
      }
      if (maxMs) return;
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    try {
      const c = connectors[job.sourceId];
      if (!c) throw new Error(`Conector ausente: ${job.sourceId}`);
      await runConnector(c);
      await completeJob(job.id);
      await runAlerts().catch((e) => console.error("alertas:", e));
    } catch (e) {
      await failJob(job.id, job.attempts, job.maxAttempts, (e as Error).message);
    }
  }
}

async function scheduleDue() {
  const sources = await prisma.source.findMany({ where: { active: true, blockedByRobots: false } });
  for (const s of sources) {
    const last = s.lastSuccessAt?.getTime() ?? 0;
    if (Date.now() - last < s.intervalMinutes * 60_000) continue;
    const pending = await prisma.crawlJob.count({ where: { sourceId: s.id, status: { in: ["PENDING", "RUNNING"] } } });
    if (!pending) await enqueue(s.id, "FULL_SYNC");
  }
}
