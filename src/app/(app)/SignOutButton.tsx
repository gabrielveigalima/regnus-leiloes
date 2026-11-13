"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return <button type="button" className="ghost" onClick={() => signOut({ callbackUrl: "/login" })}>Sair</button>;
}
