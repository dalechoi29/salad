"use client";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CalendarCheck, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateFull, isSelectionClosed } from "@/lib/utils";
import { useHomeStripHydration } from "./home-strip-hydration";

export function HomeDeliveryActions({
  isLoggedIn,
  myDeliveryDates,
  selectedDatesInPeriod,
  nextDeliveryDate,
  todayStr,
  cutoffDay,
  cutoffTime,
}: {
  isLoggedIn: boolean;
  myDeliveryDates: string[];
  selectedDatesInPeriod: string[];
  nextDeliveryDate: string | null;
  todayStr: string;
  cutoffDay: number;
  cutoffTime: string;
}) {
  const hydration = useHomeStripHydration();
  const menuDetailByDate = hydration?.menuDetailByDate ?? {};

  if (!isLoggedIn) return null;

  const pendingMenuDates = myDeliveryDates.filter(
    (d) =>
      d >= todayStr &&
      !selectedDatesInPeriod.includes(d) &&
      !isSelectionClosed(d, cutoffDay, cutoffTime)
  );

  const nextMenuName = nextDeliveryDate
    ? (menuDetailByDate[nextDeliveryDate]?.[0]?.title ?? null)
    : null;

  if (pendingMenuDates.length > 0) {
    return (
      <Link href={`/menu?date=${pendingMenuDates[0]}`} className="block">
        <Card className="border-amber-300 bg-amber-50 transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/30">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base text-amber-800 dark:text-amber-300">
                {pendingMenuDates.length}일치 메뉴 선택이 필요해요
              </CardTitle>
              <p className="text-sm text-amber-700/80 dark:text-amber-400/80">
                {pendingMenuDates
                  .slice(0, 3)
                  .map((d) => {
                    const dt = new Date(d + "T00:00:00");
                    return `${dt.getMonth() + 1}/${dt.getDate()}`;
                  })
                  .join(", ")}
                {pendingMenuDates.length > 3
                  ? ` 외 ${pendingMenuDates.length - 3}일`
                  : ""}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-amber-600/60 dark:text-amber-400/60" />
          </CardHeader>
        </Card>
      </Link>
    );
  }

  if (!nextDeliveryDate) return null;

  return (
    <Link href={`/menu?date=${nextDeliveryDate}`} className="block">
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
            <CalendarCheck className="h-5 w-5 text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">
              {formatDateFull(nextDeliveryDate)}에 배송이 와요
            </CardTitle>
            {nextMenuName ? (
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                ✓ {nextMenuName}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">메뉴 미배정</p>
            )}
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}
