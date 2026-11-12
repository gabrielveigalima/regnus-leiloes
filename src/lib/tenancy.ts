import { prisma } from "./prisma";

/** Todo acesso a dados de usuário passa por aqui: organizationId é obrigatório. */
export function tenantDb(organizationId: string) {
  if (!organizationId) throw new Error("organizationId obrigatório");
  return {
    favorites: {
      list: (userId?: string) =>
        prisma.favorite.findMany({ where: { organizationId, ...(userId ? { userId } : {}) } }),
      get: (id: string) => prisma.favorite.findFirst({ where: { id, organizationId } }),
    },
    savedSearches: {
      list: (userId?: string) =>
        prisma.savedSearch.findMany({ where: { organizationId, ...(userId ? { userId } : {}) } }),
      get: (id: string) => prisma.savedSearch.findFirst({ where: { id, organizationId } }),
    },
  };
}
