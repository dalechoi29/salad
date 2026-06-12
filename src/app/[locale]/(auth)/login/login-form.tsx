"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "@/lib/actions/auth";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Loader2, Sprout } from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_DOMAIN = "siemens-healthineers.com";

const authInputClass =
  "border-input/80 bg-background/50 transition-all duration-200 hover:border-green-400/60 focus-visible:border-green-500 focus-visible:ring-[3px] focus-visible:ring-green-500/25 dark:bg-background/40";

const authButtonClass =
  "w-full border-0 bg-gradient-to-r from-green-500 to-emerald-600 text-base font-semibold text-white shadow-md shadow-green-600/25 transition-all duration-200 hover:from-green-600 hover:to-emerald-700 hover:shadow-lg hover:shadow-green-600/30 focus-visible:ring-[3px] focus-visible:ring-green-400/40 active:scale-[0.98] disabled:opacity-70";

const AUTO_SUBMIT_DELAY_MS = 120;

function extractLocalPart(value: string): string {
  return value.split("@")[0]?.trim() ?? "";
}

export function LoginForm({ titleId }: { titleId?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [localPart, setLocalPart] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const autoSubmitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("salad_pending_email");
    if (saved) setLocalPart(extractLocalPart(saved));
    emailRef.current?.focus();
  }, []);

  const scheduleAutoSubmit = useCallback(() => {
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
    }
    autoSubmitTimerRef.current = setTimeout(() => {
      autoSubmitTimerRef.current = null;
      if (isLoading) return;
      const domLocal = extractLocalPart(emailRef.current?.value ?? "");
      if (domLocal && domLocal !== localPart) {
        setLocalPart(domLocal);
      }
      const email = domLocal || localPart.trim();
      const password = passwordRef.current?.value ?? "";
      if (!email || !/^\d{4}$/.test(password)) return;
      formRef.current?.requestSubmit();
    }, AUTO_SUBMIT_DELAY_MS);
  }, [isLoading, localPart]);

  // Credential autofill on iOS/Android may land after mount without input events.
  useEffect(() => {
    const timers = [200, 500, 1000].map((ms) =>
      setTimeout(() => scheduleAutoSubmit(), ms)
    );
    return () => timers.forEach(clearTimeout);
  }, [scheduleAutoSubmit]);

  useEffect(() => {
    scheduleAutoSubmit();
    return () => {
      if (autoSubmitTimerRef.current) {
        clearTimeout(autoSubmitTimerRef.current);
      }
    };
  }, [localPart, scheduleAutoSubmit]);

  function handleLocalPartChange(value: string) {
    setLocalPart(extractLocalPart(value));
  }

  function handleEmailInput(e: React.FormEvent<HTMLInputElement>) {
    handleLocalPartChange(e.currentTarget.value);
  }

  function handlePasswordInput() {
    scheduleAutoSubmit();
  }

  function handleEmailKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && localPart.trim()) {
      e.preventDefault();
      passwordRef.current?.focus();
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (autoSubmitTimerRef.current) {
      clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
    const effectiveLocal =
      extractLocalPart(emailRef.current?.value ?? "") || localPart.trim();
    if (!effectiveLocal) {
      toast.error("이메일을 입력해 주세요.");
      emailRef.current?.focus();
      return;
    }

    setIsLoading(true);
    const formData = new FormData(e.currentTarget);
    formData.set(
      "email",
      `${effectiveLocal.toLowerCase()}@${DEFAULT_DOMAIN}`
    );

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
        setIsLoading(false);
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
      // The login action set new auth cookies, which already invalidates the
      // client router cache — push() will fetch fresh server data. A
      // router.refresh() here would render the destination page twice.
      router.push(result.redirectTo ?? "/");
    } catch {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500/15 to-emerald-600/10">
          <Sprout className="h-7 w-7 text-green-600 dark:text-green-400" />
        </div>
        <h1 id={titleId} className="text-xl font-semibold tracking-tight">
          {t("loginTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("loginSubtitle")}</p>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email-local">{t("email")}</Label>
            <div
              className={cn(
                "flex h-12 min-w-0 items-center overflow-hidden rounded-lg border border-input/80 bg-background/50 transition-all duration-200",
                "hover:border-green-400/60 focus-within:border-green-500 focus-within:ring-[3px] focus-within:ring-green-500/25"
              )}
            >
              <Input
                ref={emailRef}
                id="email-local"
                name="username"
                type="text"
                value={localPart}
                onChange={(e) => handleLocalPartChange(e.target.value)}
                onInput={handleEmailInput}
                onKeyDown={handleEmailKeyDown}
                placeholder={t("emailLocalPlaceholder")}
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                className="h-full min-w-0 flex-1 border-0 bg-transparent pl-3 shadow-none focus-visible:border-transparent focus-visible:ring-0"
              />
              <span className="shrink-0 truncate pr-3 text-xs text-muted-foreground sm:text-sm">
                @{DEFAULT_DOMAIN}
              </span>
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
              enterKeyHint="go"
              onInput={handlePasswordInput}
              onChange={handlePasswordInput}
              className={authInputClass}
            />
          </div>
        </div>

        <div className="space-y-3">
          <Button
            type="submit"
            disabled={isLoading}
            className={authButtonClass}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? "로그인 중..." : t("login")}
          </Button>
          {!isLoading && (
            <p className="text-center text-sm text-muted-foreground">
              <Link
                href="/signup"
                className="font-medium text-green-600 underline-offset-4 transition-colors hover:text-green-700 hover:underline dark:text-green-400 dark:hover:text-green-300"
              >
                {t("signup")}
              </Link>
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
