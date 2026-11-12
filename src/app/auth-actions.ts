"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { smtpMailer } from "@/lib/alerts";
import { LoginLimiter } from "@/lib/login-limit";
import { requestPasswordReset, resetPasswordWithToken } from "@/lib/users";

export interface FormState { ok?: boolean; error?: string }

// 5 pedidos por e-mail e por IP a cada 15 min; a resposta é sempre a mesma (não revela se o e-mail existe).
const limiter = new LoginLimiter(5, 15 * 60_000);

export async function forgotPasswordAction(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().max(200).safeParse(formData.get("email"));
  const ip = ((await headers()).get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "local";
  if (email.success) {
    const keys = [`e:${email.data}`, `i:${ip}`];
    if (!keys.some((k) => limiter.isBlocked(k))) {
      keys.forEach((k) => limiter.recordFailure(k));
      await requestPasswordReset(email.data, smtpMailer()).catch((e) => console.error("reset:", (e as Error).message));
    }
  }
  return { ok: true };
}

export async function resetPasswordAction(_prev: FormState | null, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const pw = String(formData.get("password") ?? "");
  if (pw !== String(formData.get("confirm") ?? "")) return { error: "As senhas não conferem." };
  const r = await resetPasswordWithToken(token, pw);
  if (!r.ok) return { error: r.error };
  redirect("/login?redefinida=1"); // funciona com e sem JavaScript (a página do link deixa de ser válida)
}
