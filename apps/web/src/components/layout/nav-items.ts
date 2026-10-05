import { Cpu, Database, LayoutDashboard, type LucideIcon, Rocket, Settings } from "lucide-react";
import type { Route } from "next";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** `null` for sections that are not shipped yet. */
  href: Route | null;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Tableau de bord", icon: LayoutDashboard, href: "/dashboard" },
  { label: "Datasets", icon: Database, href: "/datasets" },
  { label: "Fine-tunes", icon: Cpu, href: "/fine-tunes" },
  { label: "Modèles", icon: Rocket, href: null },
  { label: "Paramètres", icon: Settings, href: "/settings" },
];

export function isActive(pathname: string, href: Route): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
