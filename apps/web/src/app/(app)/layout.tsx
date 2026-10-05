import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { getPlan } from "@/config/plans";
import { requireSession } from "@/server/auth/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user } = await requireSession();
  const plan = getPlan(user.plan);

  return (
    <div className="flex min-h-svh">
      <AppSidebar planName={plan.name} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b bg-background/80 px-4 backdrop-blur md:justify-end md:px-8">
          <Link href="/dashboard" className="md:hidden" aria-label="Tableau de bord">
            <Logo />
          </Link>
          <UserMenu name={user.name} email={user.email} image={user.image} />
        </header>
        <MobileNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
