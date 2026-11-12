"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { smtpMailer } from "@/lib/alerts";
import { changePlan, createOrganization } from "@/lib/orgs";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdmin } from "@/lib/session";

export interface OrgState { error?: string; link?: string; emailed?: boolean }

export async function createOrgAction(_p: OrgState | null, fd: FormData): Promise<OrgState> {
  const admin = await requirePlatformAdmin();
  const r = await createOrganization({
    name: String(fd.get("name") ?? ""), planId: String(fd.get("planId") ?? ""),
    ownerEmail: String(fd.get("ownerEmail") ?? ""), ownerName: String(fd.get("ownerName") ?? ""),
  }, smtpMailer());
  if (!r.ok) return { error: r.error };
  await prisma.auditLog.create({ data: { organizationId: admin.organizationId, userId: admin.id, action: "org.create", detail: { organizationId: r.organizationId } } });
  revalidatePath("/admin/organizacoes");
  return { link: r.link, emailed: r.emailed };
}

export async function changePlanAction(organizationId: string, fd: FormData) {
  const admin = await requirePlatformAdmin();
  const orgId = z.string().min(1).max(40).parse(organizationId);
  const planId = z.string().min(1).max(40).parse(fd.get("planId"));
  const r = await changePlan(orgId, planId);
  if (!r.ok) throw new Error(r.error);
  await prisma.auditLog.create({ data: { organizationId: admin.organizationId, userId: admin.id, action: "org.change_plan", detail: { organizationId: orgId, planId } } });
  revalidatePath("/admin/organizacoes");
}
