"use client";

import {
  Home,
  UtensilsCrossed,
  Leaf,
  Sprout,
  Salad,
  User,
  Shield,
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

export function DesktopSidebar() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const { user, permissions } = useUser();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  // See BottomNav for the reasoning: utility admins whose primary workflow
  // is tracking the subscription status get the 구독 현황 tab in place of
  // the regular user "My Salad" tab.
  const isSubscriptionStatusAdmin =
    user?.role === "admin" && permissions.includes("subscription_status");

  // "Store manager" admins — role=admin with subscription_status and/or
  // vendor_report permission — have an ops-only workflow. Hide the
  // user-facing 메뉴 / 대나무숲 / 마이페이지 tabs that add noise for
  // them. Super admins and regular members keep the full nav.
  const isStoreManagerAdmin =
    user?.role === "admin" &&
    (permissions.includes("subscription_status") ||
      permissions.includes("vendor_report"));

  const HIDDEN_FOR_STORE_MANAGER = new Set(["/menu", "/community", "/my"]);
  const trimmedBase: NavItem[] = isStoreManagerAdmin
    ? baseNavItems.filter((item) => !HIDDEN_FOR_STORE_MANAGER.has(item.href))
    : baseNavItems;

  const swappedBase: NavItem[] = isSubscriptionStatusAdmin
    ? trimmedBase.map((item) =>
        item.href === "/pickup"
          ? {
              href: "/admin/subscription-status",
              icon: CalendarCheck,
              labelKey: "subscriptionStatus",
            }
          : item
      )
    : trimmedBase;

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
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-64 border-r bg-background md:block">
      <div className="flex h-full flex-col">
        <Link href="/" className="flex h-16 items-center gap-2 border-b px-6">
          <Sprout className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">{tCommon("appName")}</span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-4">
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
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        {isAdmin && (
          <div className="border-t px-3 py-4">
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                pathname.startsWith("/admin")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Shield className="h-5 w-5" />
              <span>{t("admin")}</span>
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
