import { prisma } from "./prisma";

/**
 * Todo acesso a dados de usuário passa por aqui: organizationId e userId são obrigatórios
 * e entram em TODA cláusula where. Nunca consulte favorite/savedSearch direto fora deste arquivo.
 */
export function tenantDb(organizationId: string, userId: string) {
  if (!organizationId || !userId) throw new Error("organizationId e userId obrigatórios");
  const scope = { organizationId, userId };
  return {
    favorites: {
      list: () =>
        prisma.favorite.findMany({
          where: scope, orderBy: { createdAt: "desc" },
          include: { property: { include: { listings: { orderBy: { firstSeenAt: "asc" }, take: 1, include: { images: { take: 1, orderBy: { position: "asc" } } } } } } },
        }),
      get: (propertyId: string) => prisma.favorite.findFirst({ where: { ...scope, propertyId } }),
      ids: async (propertyIds: string[]) =>
        new Set((await prisma.favorite.findMany({ where: { ...scope, propertyId: { in: propertyIds } }, select: { propertyId: true } })).map((f) => f.propertyId)),
      add: (propertyId: string) =>
        prisma.favorite.upsert({ where: { organizationId_userId_propertyId: { ...scope, propertyId } }, update: {}, create: { ...scope, propertyId } }),
      remove: (propertyId: string) => prisma.favorite.deleteMany({ where: { ...scope, propertyId } }),
      update: (propertyId: string, data: { note: string | null; label: string | null }) =>
        prisma.favorite.updateMany({ where: { ...scope, propertyId }, data }),
    },
    savedSearches: {
      list: () => prisma.savedSearch.findMany({ where: scope, orderBy: { createdAt: "desc" } }),
      create: (data: { name: string; frequency: "IMMEDIATE" | "DAILY"; filters: Record<string, string> }) =>
        prisma.savedSearch.create({ data: { ...scope, ...data } }),
      remove: (id: string) => prisma.savedSearch.deleteMany({ where: { ...scope, id } }),
      setFrequency: (id: string, frequency: "IMMEDIATE" | "DAILY") =>
        prisma.savedSearch.updateMany({ where: { ...scope, id }, data: { frequency } }),
    },
  };
}
