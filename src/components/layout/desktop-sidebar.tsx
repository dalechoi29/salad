"use client";

import {
  Home,
  UtensilsCrossed,
  Leaf,
  Sprout,
  Salad,
  User,
  Shield,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useUser } from "@/components/providers/user-provider";

const navItems = [
  { href: "/", icon: Home, labelKey: "home" as const },
  { href: "/menu", icon: UtensilsCrossed, labelKey: "menu" as const },
  { href: "/pickup", icon: Salad, labelKey: "mySalad" as const },
  {
    href: "/community",
    icon: Leaf,
    labelKey: "community" as const,
  },
  { href: "/my", icon: User, labelKey: "myPage" as const },
];

export function DesktopSidebar() {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const pathname = usePathname();
  const { user } = useUser();
  const isAdmin = user?.role === "admin";

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
