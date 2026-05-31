"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LoginForm } from "./login-form";

export function LoginPageShell() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  function handleClose() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      {/* Blurred background */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-500",
          mounted ? "opacity-100" : "opacity-0"
        )}
      >
        <img
          src="/images/auth-salads.png"
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl saturate-125"
        />
        <div className="absolute inset-0 bg-background/75 dark:bg-background/80" />
        <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      </div>

      {/* Click-to-dismiss overlay */}
      <button
        type="button"
        aria-label="Close login"
        onClick={handleClose}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          mounted ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
        className={cn(
          "relative z-10 w-full max-w-md transform transition-all duration-300 ease-out",
          "max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-border/60 bg-card shadow-2xl shadow-black/20",
          mounted ? "scale-100 opacity-100" : "scale-[0.97] opacity-0"
        )}
      >
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="px-6 pb-8 pt-10 md:px-8 md:pb-10 md:pt-12">
          <LoginForm titleId="login-dialog-title" />
        </div>
      </div>
    </div>
  );
}
