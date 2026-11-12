import { prisma } from "./prisma";

/** Ponto único de aplicação dos limites do Plan (usuários, buscas salvas, UFs, API, CSV). */
export async function getPlan(organizationId: string) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  return org.plan;
}

export async function canCreateSavedSearch(organizationId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const plan = await getPlan(organizationId);
  if (plan.maxSavedSearches == null) return { ok: true };
  const count = await prisma.savedSearch.count({ where: { organizationId } });
  return count < plan.maxSavedSearches
    ? { ok: true }
    : { ok: false, reason: `Seu plano permite até ${plan.maxSavedSearches} buscas salvas.` };
}
