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

/** UFs liberadas pelo plano (null = todas). */
export async function allowedUfsFor(organizationId: string): Promise<string[] | null> {
  const ufs = (await getPlan(organizationId)).allowedUfs;
  return Array.isArray(ufs) ? (ufs as string[]) : null;
}

export async function canExportCsv(organizationId: string) {
  return (await getPlan(organizationId)).csvExport;
}

export async function canUseApi(organizationId: string) {
  return (await getPlan(organizationId)).apiAccess;
}
