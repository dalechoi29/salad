"use client";

import {
  Home,
  UtensilsCrossed,
  Salad,
  Leaf,
  User,
  FileSpreadsheet,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/user-provider";

type NavItem = {
  href: string;
  icon: typeof Home;
  labelKey:
    | "home"
    | "menu"
    | "mySalad"
    | "community"
    | "myPage"
    | "report";
};

const baseNavItems: NavItem[] = [
  { href: "/", icon: Home, labelKey: "home" },
  { href: "/menu", icon: UtensilsCrossed, labelKey: "menu" },
  { href: "/pickup", icon: Salad, labelKey: "mySalad" },
  { href: "/community", icon: Leaf, labelKey: "community" },
  { href: "/my", icon: User, labelKey: "myPage" },
];

export function BottomNav() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const { permissions } = useUser();

  const navItems: NavItem[] = permissions.includes("vendor_report")
    ? [
        ...baseNavItems,
        {
          href: "/admin/reports",
          icon: FileSpreadsheet,
          labelKey: "report",
        },
      ]
    : baseNavItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="flex h-16 items-center justify-around">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
