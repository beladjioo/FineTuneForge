import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { getSession } from "@/server/auth/session";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  // A real (DB-validated) session check, unlike the cookie-only proxy check.
  if (await getSession()) redirect("/dashboard");

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 bg-muted/30 px-4 py-12">
      <Link href="/" aria-label="Accueil">
        <Logo className="text-lg" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
