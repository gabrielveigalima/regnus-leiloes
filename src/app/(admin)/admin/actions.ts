"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";
import { connectors } from "@/crawler/registry";
import { mergeProperties, rejectCandidate } from "@/lib/dedup";

const sourceId = z.string().min(1).max(40);

async function audit(userId: string, organizationId: string, action: string, detail: object) {
  await prisma.auditLog.create({ data: { userId, organizationId, action, detail } });
}

export async function setSourceActive(id: string, active: boolean) {
  const u = await requirePlatformAdmin();
  const sid = sourceId.parse(id);
  if (active && !connectors[sid]) throw new Error("Esta fonte ainda não tem conector implementado.");
  await prisma.source.update({ where: { id: sid }, data: { active } });
  await audit(u.id, u.organizationId, active ? "source.activate" : "source.deactivate", { sourceId: sid });
  revalidatePath("/admin/fontes");
}

/** Enfileira uma coleta completa; o worker (npm run worker / worker:tick) a executa. */
export async function runSourceNow(id: string) {
  const u = await requirePlatformAdmin();
  const sid = sourceId.parse(id);
  if (!connectors[sid]) throw new Error("Esta fonte ainda não tem conector implementado.");
  const pending = await prisma.crawlJob.count({ where: { sourceId: sid, status: { in: ["PENDING", "RUNNING"] } } });
  if (!pending) await prisma.crawlJob.create({ data: { sourceId: sid, type: "FULL_SYNC" } });
  await audit(u.id, u.organizationId, "source.run_now", { sourceId: sid, alreadyQueued: pending > 0 });
  revalidatePath("/admin/fontes");
}

/** Libera uma fonte marcada como bloqueada por robots para ser verificada novamente na próxima coleta. */
export async function clearRobotsBlock(id: string) {
  const u = await requirePlatformAdmin();
  const sid = sourceId.parse(id);
  await prisma.source.update({ where: { id: sid }, data: { blockedByRobots: false } });
  await audit(u.id, u.organizationId, "source.clear_robots_block", { sourceId: sid });
  revalidatePath("/admin/fontes");
}

/** `keep` = qual imóvel sobrevive ("A" ou "B"); o outro é absorvido (anúncios e favoritos migram). */
export async function mergeDuplicate(candidateId: string, keep: "A" | "B") {
  const u = await requirePlatformAdmin();
  const c = await prisma.duplicateCandidate.findUniqueOrThrow({ where: { id: z.string().min(1).max(40).parse(candidateId) } });
  if (c.status !== "PENDING") return;
  const [keepId, dropId] = keep === "A" ? [c.propertyAId, c.propertyBId] : [c.propertyBId, c.propertyAId];
  await mergeProperties(keepId, dropId, u.id);
  await audit(u.id, u.organizationId, "duplicate.merge", { candidateId: c.id, keepId, dropId });
  revalidatePath("/admin/duplicados");
}

export async function rejectDuplicate(candidateId: string) {
  const u = await requirePlatformAdmin();
  const id = z.string().min(1).max(40).parse(candidateId);
  await rejectCandidate(id, u.id);
  await audit(u.id, u.organizationId, "duplicate.reject", { candidateId: id });
  revalidatePath("/admin/duplicados");
}
