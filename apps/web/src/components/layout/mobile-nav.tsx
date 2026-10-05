"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isActive, NAV_ITEMS } from "./nav-items";

/** Compact horizontal navigation shown below the header on small screens. */
export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 overflow-x-auto border-b px-4 py-2 md:hidden"
      aria-label="Navigation"
    >
      {NAV_ITEMS.filter((item) => item.href !== null).map(({ label, icon: Icon, href }) =>
        href ? (
          <Link
            key={label}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-muted-foreground text-sm",
              isActive(pathname, href) && "bg-accent text-foreground",
            )}
          >
            <Icon className="size-4" aria-hidden />
            {label}
          </Link>
        ) : null,
      )}
    </nav>
  );
}
