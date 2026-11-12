import "next-auth";
import "next-auth/jwt";

type Role = "OWNER" | "ADMIN" | "MEMBER";

declare module "next-auth" {
  interface User { organizationId: string; role: Role; isPlatformAdmin: boolean }
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; organizationId: string; role: Role; isPlatformAdmin: boolean };
  }
}
declare module "next-auth/jwt" {
  interface JWT { userId: string; organizationId: string; role: Role; isPlatformAdmin: boolean }
}
