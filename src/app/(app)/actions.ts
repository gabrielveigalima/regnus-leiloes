"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenancy";
import { canCreateSavedSearch } from "@/lib/access";
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
