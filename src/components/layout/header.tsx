"use client";

import { Sprout, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LanguageToggle } from "@/components/layout/language-toggle";
import { useUser } from "@/components/providers/user-provider";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/actions/auth";

export function Header() {
  const t = useTranslations("common");
  const tAuth = useTranslations("auth");
  const { user } = useUser();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2 md:hidden">
          <Sprout className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold">{t("appName")}</span>
        </div>
        <div className="hidden md:block" />
        <div className="flex items-center gap-1">
          <LanguageToggle />
          <ThemeToggle />
          {user && (
            <form action={logout}>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <LogOut className="h-4 w-4" />
                <span className="sr-only">{tAuth("logout")}</span>
              </Button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
