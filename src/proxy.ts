import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(req: NextRequest) {
  const token = await getToken({ req });
  if (token?.userId && token.organizationId) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL("/login", req.url);
  url.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

// Tudo exige login, exceto login, recuperação de senha, rotas do next-auth, health, a API pública (autenticada por chave) e assets.
export const config = {
  matcher: ["/((?!login|esqueci-senha|redefinir-senha|api/auth|api/health|api/v1|_next/static|_next/image|favicon.ico|logo_transparente.png|icon.png).*)"],
};
