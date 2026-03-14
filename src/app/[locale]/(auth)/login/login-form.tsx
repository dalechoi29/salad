"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/actions/auth";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Loader2, Sprout } from "lucide-react";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [savedEmail, setSavedEmail] = useState("");

  useEffect(() => {
    const email = localStorage.getItem("salad_pending_email");
    if (email) setSavedEmail(email);
  }, []);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);

    try {
      const result = await login(formData);

      if (result.error) {
        const errorMessages: Record<string, string> = {
          INVALID_PASSWORD_FORMAT: t("passwordPlaceholder"),
          INVALID_CREDENTIALS: "Invalid email or password",
          PENDING_APPROVAL: t("pendingApproval"),
          ACCOUNT_DISABLED: "Account has been disabled",
          PROFILE_NOT_FOUND: "Profile not found",
        };

        const message = errorMessages[result.error] || result.error;

        if (result.error === "PENDING_APPROVAL") {
          router.push("/pending");
          return;
        }

        toast.error(message);
        return;
      }

      localStorage.removeItem("salad_pending_email");
      toast.success("환영해요! 건강한 끼니에요");
      router.push("/");
      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Sprout className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">{t("loginTitle")}</span>
        </div>
      </div>

      <form action={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={savedEmail}
              placeholder={t("emailPlaceholder")}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder={t("passwordPlaceholder")}
              required
              autoComplete="current-password"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("login")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/signup"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("signup")}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
