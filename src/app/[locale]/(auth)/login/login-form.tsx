"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/actions/auth";
import { getAllowedDomains } from "@/lib/actions/admin";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Loader2, Sprout } from "lucide-react";

export function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("salad_pending_email");
    if (saved) setEmail(saved);
    getAllowedDomains().then((data) => {
      setDomains(data.map((d: any) => d.domain));
    });
  }, []);

  function handleEmailChange(value: string) {
    setEmail(value);
    if (value.includes("@") && !value.split("@")[1]?.includes(".")) {
      setShowSuggestion(true);
    } else {
      setShowSuggestion(false);
    }
  }

  function applySuggestion(domain: string) {
    const localPart = email.split("@")[0];
    setEmail(`${localPart}@${domain}`);
    setShowSuggestion(false);
    passwordRef.current?.focus();
  }

  async function handleSubmit(formData: FormData) {
    setIsLoading(true);
    const submittedEmail = formData.get("email") as string;
    setEmail(submittedEmail);

    try {
      const result = await login(formData);

      if (result.error) {
        const errorMessages: Record<string, string> = {
          INVALID_PASSWORD_FORMAT: t("passwordPlaceholder"),
          INVALID_CREDENTIALS: "이메일이나 비밀번호를 다시 확인해주세요.",
          PENDING_APPROVAL: t("pendingApproval"),
          ACCOUNT_DISABLED: "계정이 비활성화 되었어요.",
          PROFILE_NOT_FOUND: "프로필을 찾을 수 없어요.",
        };

        const message = errorMessages[result.error] || result.error;

        if (result.error === "PENDING_APPROVAL") {
          router.push("/pending");
          return;
        }

        toast.error(message);
        setTimeout(() => {
          if (passwordRef.current) {
            passwordRef.current.value = "";
            passwordRef.current.focus();
          }
        }, 0);
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
            <div className="relative">
              <Input
                id="email"
                name="email"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestion(false), 150)}
                placeholder={t("emailPlaceholder")}
                required
                autoComplete="off"
              />
              {showSuggestion && domains.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                  {domains
                    .filter((d) => {
                      const typed = email.split("@")[1] ?? "";
                      return d.startsWith(typed);
                    })
                    .map((domain) => (
                      <button
                        key={domain}
                        type="button"
                        className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestion(domain)}
                      >
                        {email.split("@")[0]}@{domain}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              ref={passwordRef}
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
