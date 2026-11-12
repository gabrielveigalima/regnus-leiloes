"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { tenantDb } from "@/lib/tenancy";

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
