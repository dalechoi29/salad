"use client";

import {
  Home,
  UtensilsCrossed,
  Salad,
  Leaf,
  User,
  FileSpreadsheet,
  CalendarCheck,
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
    | "report"
    | "subscriptionStatus";
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
  const { user, permissions } = useUser();

  // Utility admins (role=admin, not super_admin) who have been granted the
  // `subscription_status` permission use the subscription-status page as
  // their primary workflow, so swap out "My Salad" for a direct link to
  // that page. Super admins keep the full user-facing nav.
  const isSubscriptionStatusAdmin =
    user?.role === "admin" && permissions.includes("subscription_status");

  const swappedBase: NavItem[] = isSubscriptionStatusAdmin
    ? baseNavItems.map((item) =>
        item.href === "/pickup"
          ? {
              href: "/admin/subscription-status",
              icon: CalendarCheck,
              labelKey: "subscriptionStatus",
            }
          : item
      )
    : baseNavItems;

  const navItems: NavItem[] = permissions.includes("vendor_report")
    ? [
        ...swappedBase,
        {
          href: "/admin/reports",
          icon: FileSpreadsheet,
          labelKey: "report",
        },
      ]
    : swappedBase;

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
