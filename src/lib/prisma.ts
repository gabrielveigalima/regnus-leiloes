import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl(): string | undefined {
  const existing = process.env.DATABASE_URL;
  if (existing && !existing.includes("${")) return existing;
  const { DB_USER, DB_PASSWORD = "", DB_HOST, DB_PORT = "3306", DB_NAME } = process.env;
  if (!DB_USER || !DB_HOST || !DB_NAME) return undefined;
  const host = DB_HOST.trim() === "localhost" ? "127.0.0.1" : DB_HOST.trim();
  return `mysql://${encodeURIComponent(DB_USER.trim())}:${encodeURIComponent(DB_PASSWORD)}@${host}:${DB_PORT}/${DB_NAME.trim()}`;
}

export const prisma = g.prisma ?? new PrismaClient({ datasources: { db: { url: databaseUrl() } } });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
