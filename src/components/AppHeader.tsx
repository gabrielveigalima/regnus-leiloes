import Link from "next/link";
import { NavLink } from "./NavLink";
import { SignOutButton } from "@/app/(app)/SignOutButton";

export interface NavItem { href: string; label: string }

export function AppHeader({ items, userLabel, home = "/busca" }: { items: NavItem[]; userLabel: string; home?: string }) {
  const initial = (userLabel.trim()[0] ?? "?").toUpperCase();
  return (
    <header className="main-header">
      <Link href={home} className="header-logo"><img src="/logo-horizontal.png" alt="Regnus Leilões" /></Link>
      <nav className="header-nav" aria-label="Principal">
        {items.map((i) => <NavLink key={i.href} href={i.href}>{i.label}</NavLink>)}
      </nav>
      <div className="header-actions">
        <Link href="/conta" className="header-profile" title="Minha conta">
          <span className="header-avatar" aria-hidden="true">{initial}</span>
          <span className="header-profile-label">{userLabel}</span>
        </Link>
        <SignOutButton />
      </div>
    </header>
  );
}
