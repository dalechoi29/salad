"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signup } from "@/lib/actions/auth";
import { getAllowedDomains } from "@/lib/actions/admin";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Loader2, CheckCircle2, Sprout } from "lucide-react";

export function SignupForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [email, setEmail] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const realNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllowedDomains().then((data) => {
      setDomains(data.map((d: any) => d.domain));
    });
  }, []);

  const filteredDomains = useMemo(() => {
    const typed = email.split("@")[1] ?? "";
    return domains.filter((d) => d.startsWith(typed));
  }, [domains, email]);

  function handleEmailChange(value: string) {
    setEmail(value);
    setHighlightIdx(-1);
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
    setHighlightIdx(-1);
    realNameRef.current?.focus();
  }

  function handleEmailKeyDown(e: React.KeyboardEvent) {
    if (!showSuggestion || filteredDomains.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev < filteredDomains.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev > 0 ? prev - 1 : filteredDomains.length - 1
      );
    } else if (e.key === "Enter" && highlightIdx >= 0) {
      e.preventDefault();
      applySuggestion(filteredDomains[highlightIdx]);
    } else if (e.key === "Escape") {
      setShowSuggestion(false);
      setHighlightIdx(-1);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsLoading(true);
    const formData = new FormData(e.currentTarget);

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

      const submittedEmail = formData.get("email") as string;
      if (submittedEmail) {
        localStorage.setItem("salad_pending_email", submittedEmail);
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

      <form onSubmit={handleSubmit} className="space-y-6">
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
                onKeyDown={handleEmailKeyDown}
                onBlur={() => setTimeout(() => { setShowSuggestion(false); setHighlightIdx(-1); }, 150)}
                placeholder={t("emailPlaceholder")}
                required
                autoComplete="off"
              />
              {showSuggestion && filteredDomains.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                  {filteredDomains.map((domain, idx) => (
                    <button
                      key={domain}
                      type="button"
                      className={`flex w-full items-center px-3 py-2 text-sm ${idx === highlightIdx ? "bg-accent" : "hover:bg-accent"}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion(domain)}
                      onMouseEnter={() => setHighlightIdx(idx)}
                    >
                      {email.split("@")[0]}@{domain}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="realName">{t("realName")}</Label>
            <Input
              ref={realNameRef}
              id="realName"
              name="realName"
              type="text"
              placeholder="김첨지"
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
              placeholder="춤추는비버"
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
