import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

const clean = (v: string | undefined) => {
  let s = (v ?? "").trim();
  while (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) s = s.slice(1, -1).trim();
  return s;
};

function databaseUrl(): string | undefined {
  const existing = clean(process.env.DATABASE_URL);
  if (/^mysql:\/\//i.test(existing) && !existing.includes("${")) return existing;
  const DB_USER = clean(process.env.DB_USER), DB_HOST = clean(process.env.DB_HOST), DB_NAME = clean(process.env.DB_NAME);
  if (!DB_USER || !DB_HOST || !DB_NAME) return undefined;
  const host = DB_HOST === "localhost" ? "127.0.0.1" : DB_HOST;
  return `mysql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(clean(process.env.DB_PASSWORD))}@${host}:${clean(process.env.DB_PORT) || "3306"}/${DB_NAME}`;
}

export const prisma = g.prisma ?? new PrismaClient({ datasources: { db: { url: databaseUrl() ?? "mysql://unset:unset@127.0.0.1:3306/unset" } } });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
