import { useTranslations } from "next-intl";
import { Clock, ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function PendingPage() {
  const t = useTranslations("auth");

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
              <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-2 text-center">
              <h1 className="text-xl font-semibold">{t("pendingApproval")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("signupSuccess")}
              </p>
            </div>
            <Link
              href="/login"
              className="mt-2 inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("login")}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
