import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcrypt";
import { prisma } from "./prisma";
import { LoginLimiter } from "./login-limit";

const limiter = new LoginLimiter();
// Hash válido fictício para gastar o mesmo tempo quando o e-mail não existe.
let dummyHash: string | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hashSync("dummy-password", 12));

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: { email: {}, password: {} },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password;
        if (!email || !password) return null;

        const ip = String(req?.headers?.["x-forwarded-for"] ?? "").split(",")[0]?.trim() || "local";
        const keys = [`e:${email}`, `i:${ip}`];
        if (keys.some((k) => limiter.isBlocked(k))) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { orderBy: { id: "asc" }, take: 1 } },
        });
        const ok = await bcrypt.compare(password, user?.passwordHash ?? getDummyHash());
        const membership = user?.memberships[0];
        if (!user || !ok || !membership) {
          keys.forEach((k) => limiter.recordFailure(k));
          return null;
        }
        keys.forEach((k) => limiter.reset(k));
        return { id: user.id, email: user.email, name: user.name, organizationId: membership.organizationId, role: membership.role, isPlatformAdmin: user.isPlatformAdmin };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.organizationId = user.organizationId;
        token.role = user.role;
        token.isPlatformAdmin = user.isPlatformAdmin;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { ...session.user, id: token.userId, organizationId: token.organizationId, role: token.role, isPlatformAdmin: token.isPlatformAdmin };
      return session;
    },
  },
};
