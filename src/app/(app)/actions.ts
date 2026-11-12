"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenancy";
import { canCreateSavedSearch, canUseApi } from "@/lib/access";
import { generateApiKey } from "@/lib/api-keys";
import { parseFilters } from "@/lib/search";

const id = z.string().min(1).max(40);

export async function toggleFavorite(propertyId: string) {
  const u = await requireSession();
  const pid = id.parse(propertyId);
  const db = tenantDb(u.organizationId, u.id).favorites;
  if (await db.get(pid)) await db.remove(pid);
  else {
    if (!(await prisma.property.findUnique({ where: { id: pid }, select: { id: true } }))) throw new Error("Imóvel não encontrado");
    await db.add(pid);
  }
  revalidatePath(`/imovel/${pid}`);
  revalidatePath("/favoritos");
}

const NoteSchema = z.object({ note: z.string().max(2000), label: z.string().max(40) });

export async function updateFavorite(propertyId: string, formData: FormData) {
  const u = await requireSession();
  const pid = id.parse(propertyId);
  const { note, label } = NoteSchema.parse({ note: formData.get("note") ?? "", label: formData.get("label") ?? "" });
  await tenantDb(u.organizationId, u.id).favorites.update(pid, { note: note.trim() || null, label: label.trim() || null });
  revalidatePath("/favoritos");
  revalidatePath(`/imovel/${pid}`);
}

const SaveSearchSchema = z.object({
  name: z.string().trim().min(1).max(80),
  frequency: z.enum(["IMMEDIATE", "DAILY"]),
  params: z.string().max(4000),
});

/** Salva os filtros atuais da busca; se o plano estourar o limite, redireciona com a mensagem. */
export async function saveSearch(formData: FormData): Promise<void> {
  const u = await requireSession();
  const { name, frequency, params } = SaveSearchSchema.parse({
    name: formData.get("name"), frequency: formData.get("frequency"), params: formData.get("params") ?? "{}",
  });
  const raw = z.record(z.string(), z.string()).parse(JSON.parse(params));
  delete raw.cursor;
  parseFilters(raw); // valida
  const allowed = await canCreateSavedSearch(u.organizationId);
  if (!allowed.ok) redirect(`/alertas?erro=${encodeURIComponent(allowed.reason)}`);
  await tenantDb(u.organizationId, u.id).savedSearches.create({ name, frequency, filters: raw });
  revalidatePath("/alertas");
  redirect("/alertas?ok=1");
}

export async function deleteSearch(searchId: string) {
  const u = await requireSession();
  await tenantDb(u.organizationId, u.id).savedSearches.remove(id.parse(searchId));
  revalidatePath("/alertas");
}

export async function setSearchFrequency(searchId: string, formData: FormData) {
  const u = await requireSession();
  const frequency = z.enum(["IMMEDIATE", "DAILY"]).parse(formData.get("frequency"));
  await tenantDb(u.organizationId, u.id).savedSearches.setFrequency(id.parse(searchId), frequency);
  revalidatePath("/alertas");
}

// ---- Chaves de API (somente OWNER/ADMIN da organização; plano precisa incluir API) ----
export interface ApiKeyResult { key?: string; error?: string }

async function requireOrgAdmin() {
  const u = await requireSession();
  if (u.role !== "OWNER" && u.role !== "ADMIN") throw new Error("Apenas administradores da organização gerenciam chaves de API.");
  return u;
}

export async function createApiKeyAction(_prev: ApiKeyResult | null, formData: FormData): Promise<ApiKeyResult> {
  const u = await requireOrgAdmin();
  const name = z.string().trim().min(1).max(60).safeParse(formData.get("name"));
  if (!name.success) return { error: "Informe um nome (até 60 caracteres)." };
  if (!(await canUseApi(u.organizationId))) return { error: "O plano da sua organização não inclui acesso à API." };
  if ((await prisma.apiKey.count({ where: { organizationId: u.organizationId, revokedAt: null } })) >= 10) return { error: "Limite de 10 chaves ativas." };
  const { key, prefix, hash } = generateApiKey();
  await prisma.apiKey.create({ data: { organizationId: u.organizationId, name: name.data, prefix, hash } });
  await prisma.auditLog.create({ data: { organizationId: u.organizationId, userId: u.id, action: "apikey.create", detail: { prefix, name: name.data } } });
  revalidatePath("/chaves");
  return { key };
}

export async function revokeApiKey(keyId: string) {
  const u = await requireOrgAdmin();
  const res = await prisma.apiKey.updateMany({ where: { id: id.parse(keyId), organizationId: u.organizationId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (res.count) await prisma.auditLog.create({ data: { organizationId: u.organizationId, userId: u.id, action: "apikey.revoke", detail: { keyId } } });
  revalidatePath("/chaves");
}
