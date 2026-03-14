"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "@/lib/actions/auth";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Loader2, CheckCircle2, Sprout } from "lucide-react";

export function SignupForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);

    try {
      const result = await signup(formData);

      if (result.error) {
        const errorMessages: Record<string, string> = {
          INVALID_DOMAIN: t("invalidDomain"),
          EMAIL_EXISTS: "This email is already registered",
        };

        toast.error(errorMessages[result.error] || result.error);
        return;
      }

      const email = formData.get("email") as string;
      if (email) {
        localStorage.setItem("salad_pending_email", email);
      }

      setIsSuccess(true);
    } finally {
      setIsLoading(false);
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-8">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Sprout className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">{t("loginTitle")}</span>
        </div>
      </div>

        <div className="flex flex-col items-center gap-4 py-8">
          <CheckCircle2 className="h-12 w-12 text-green-500" />
          <div className="space-y-2 text-center">
            <p className="font-medium">{t("signupSuccess")}</p>
            <p className="text-sm text-muted-foreground">
              {t("pendingApproval")}
            </p>
          </div>
          <Link href="/login">
            <Button variant="outline">{t("login")}</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2">
          <Sprout className="h-6 w-6 text-primary" />
          <span className="text-lg font-semibold">{t("signupTitle")}</span>
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
              placeholder={t("emailPlaceholder")}
              required
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              e.g. name@siemens-healthineers.com
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="realName">{t("realName")}</Label>
            <Input
              id="realName"
              name="realName"
              type="text"
              required
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nickname">{t("nickname")}</Label>
            <Input
              id="nickname"
              name="nickname"
              type="text"
              required
              autoComplete="username"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("signup")}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("login")}
            </Link>
          </p>
        </div>
      </form>
    </div>
  );
}
