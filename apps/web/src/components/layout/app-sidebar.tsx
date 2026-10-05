"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

export function AppSidebar({ planName }: { planName: string }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" aria-label="Tableau de bord">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Navigation principale">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) =>
          href ? (
            <Link
              key={label}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground",
                isActive(pathname, href) && "bg-accent text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </Link>
          ) : (
            <span
              key={label}
              className="flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2 font-medium text-muted-foreground/60 text-sm"
              title="Disponible prochainement"
            >
              <Icon className="size-4" aria-hidden />
              {label}
              <Badge variant="secondary" className="ml-auto text-[10px]">
                Bientôt
              </Badge>
            </span>
          ),
        )}
      </nav>

      <div className="border-t p-4 text-muted-foreground text-xs">
        Plan <span className="font-medium text-foreground">{planName}</span>
      </div>
    </aside>
  );
}
