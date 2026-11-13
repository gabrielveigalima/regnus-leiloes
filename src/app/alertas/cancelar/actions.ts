"use server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribe } from "@/lib/unsub";

/** Apaga a busca salva a partir do link assinado do e-mail (sem login). */
export async function unsubscribeAction(formData: FormData) {
  const id = String(formData.get("id") ?? ""), sig = String(formData.get("sig") ?? "");
  if (!verifyUnsubscribe(id, sig)) redirect("/alertas/cancelar");
  await prisma.savedSearch.deleteMany({ where: { id } });
  redirect("/alertas/cancelar?feito=1");
}
