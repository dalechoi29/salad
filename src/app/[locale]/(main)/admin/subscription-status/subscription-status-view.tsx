"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Users,
  CalendarCheck,
  Loader2,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { getSubscribersForDate } from "@/lib/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import type { SubscriptionPeriod, Holiday } from "@/types";

interface Props {
  currentPeriod: SubscriptionPeriod | null;
  nextPeriod: SubscriptionPeriod | null;
  currentCounts: Record<string, number>;
  nextCounts: Record<string, number>;
  holidays: Holiday[];
  showBackButton?: boolean;
  showTitle?: boolean;
  isLoggedIn?: boolean;
}

const DAY_LABELS = ["월", "화", "수", "목", "금"];

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekRange(monday: Date): string {
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);
  const mStr = monday.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  const fStr = friday.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
  });
  return `${mStr} ~ ${fStr}`;
}

function fmtISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getInitialMonday(period: SubscriptionPeriod | null): Date {
  const now = new Date();
  const dow = now.getDay();
  const isWeekend = dow === 0 || dow === 6;

  if (period?.delivery_start) {
    const deliveryStart = new Date(period.delivery_start + "T00:00:00");
    const periodMonday = getMonday(deliveryStart);
    const currentMonday = getMonday(now);

    if (currentMonday >= periodMonday) {
      return isWeekend
        ? new Date(currentMonday.getTime() + 7 * 86400000)
        : currentMonday;
    }
    return periodMonday;
  }

  const monday = getMonday(now);
  return isWeekend ? new Date(monday.getTime() + 7 * 86400000) : monday;
}

function MonthCalendar({
  period,
  counts,
  holidays,
  isLoggedIn = true,
}: {
  period: SubscriptionPeriod;
  counts: Record<string, number>;
  holidays: Holiday[];
  isLoggedIn?: boolean;
}) {
  const router = useRouter();
  const [currentMonday, setCurrentMonday] = useState(() =>
    getInitialMonday(period)
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState("");
  const [dialogUsers, setDialogUsers] = useState<
    { userId: string; realName: string; saladsPerDelivery: number }[]
  >([]);
  const [dialogLoading, setDialogLoading] = useState(false);

  const holidaySet = useMemo(
    () => new Set(holidays.map((h) => h.holiday_date)),
    [holidays]
  );
  const holidayMap = useMemo(
    () => new Map(holidays.map((h) => [h.holiday_date, h.name])),
    [holidays]
  );

  const deliveryStartDate = period.delivery_start
    ? new Date(period.delivery_start + "T00:00:00")
    : null;
  const deliveryEndDate = period.delivery_end
    ? new Date(period.delivery_end + "T00:00:00")
    : null;

  const firstMonday = deliveryStartDate
    ? getMonday(deliveryStartDate)
    : null;
  const lastMonday = deliveryEndDate ? getMonday(deliveryEndDate) : null;

  const canGoPrev = firstMonday ? currentMonday > firstMonday : true;
  const canGoNext = lastMonday ? currentMonday < lastMonday : true;

  function navigateWeek(direction: number) {
    const newMonday = new Date(currentMonday);
    newMonday.setDate(newMonday.getDate() + direction * 7);
    if (direction < 0 && firstMonday && newMonday < firstMonday) return;
    if (direction > 0 && lastMonday && newMonday > lastMonday) return;
    setCurrentMonday(newMonday);
  }

  function getDateForDay(dayIndex: number): Date {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + dayIndex);
    return d;
  }

  function isOutOfRange(dayIndex: number): boolean {
    const date = getDateForDay(dayIndex);
    if (deliveryStartDate && date < deliveryStartDate) return true;
    if (deliveryEndDate && date > deliveryEndDate) return true;
    return false;
  }

  async function handleDateClick(dateStr: string, count: number) {
    if (count === 0) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    setDialogDate(dateStr);
    setDialogOpen(true);
    setDialogLoading(true);
    setDialogUsers([]);
    try {
      const users = await getSubscribersForDate(period.id, dateStr);
      setDialogUsers(users);
    } catch {
      setDialogUsers([]);
    } finally {
      setDialogLoading(false);
    }
  }

  const todayStr = fmtISO(new Date());

  const totalSubscriptions = useMemo(() => {
    let total = 0;
    for (const c of Object.values(counts)) total += c;
    return total;
  }, [counts]);

  const weekTotal = useMemo(() => {
    let total = 0;
    for (let i = 0; i < 5; i++) {
      const dateStr = fmtISO(getDateForDay(i));
      total += counts[dateStr] || 0;
    }
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonday, counts]);

  const dialogDateFormatted = dialogDate
    ? new Date(dialogDate + "T00:00:00").toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        weekday: "short",
      })
    : "";

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigateWeek(-1)}
              disabled={!canGoPrev}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-center">
              <CardTitle className="text-base">
                {formatWeekRange(currentMonday)}
              </CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                이번 주 {weekTotal}건
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigateWeek(1)}
              disabled={!canGoNext}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-2">
            {DAY_LABELS.map((label, i) => {
              const dateObj = getDateForDay(i);
              const dateNum = dateObj.getDate();
              const dateStr = fmtISO(dateObj);
              const count = counts[dateStr] || 0;
              const isHoliday = holidaySet.has(dateStr);
              const hName = holidayMap.get(dateStr);
              const outOfRange = isOutOfRange(i);
              const isToday = dateStr === todayStr;
              const clickable = count > 0 && !isHoliday && !outOfRange;

              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => clickable && handleDateClick(dateStr, count)}
                  disabled={!clickable}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all ${
                    isHoliday
                      ? "border-red-200 bg-red-50 text-red-400 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-500"
                      : outOfRange
                        ? "border-muted bg-muted/30 text-muted-foreground opacity-50"
                        : isToday
                          ? "border-primary bg-primary/5"
                          : "border-muted bg-background"
                  } ${clickable ? "cursor-pointer hover:border-primary/50 hover:bg-primary/5" : ""}`}
                >
                  <span className="text-[11px] text-muted-foreground">{label}</span>
                  <span
                    className={`text-sm ${isToday ? "font-semibold text-primary" : "text-muted-foreground"}`}
                  >
                    {dateNum}
                  </span>
                  {isHoliday && hName ? (
                    <span className="w-full truncate text-center text-[9px] leading-tight">
                      {hName}
                    </span>
                  ) : outOfRange ? (
                    <span className="h-5" />
                  ) : (
                    <span
                      className={`flex items-center gap-1 text-lg font-bold ${
                        count > 0
                          ? "text-primary"
                          : "text-muted-foreground/50"
                      }`}
                    >
                      <Users className="h-4 w-4" />
                      {count}
                    </span>
                  )}
                  {isToday && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                      Today
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{dialogDateFormatted} 구독자</DialogTitle>
          </DialogHeader>
          {dialogLoading ? (
            <div className="space-y-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-4 flex-1" />
                  <Skeleton className="h-4 w-8" />
                </div>
              ))}
            </div>
          ) : dialogUsers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              구독자가 없습니다
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {dialogUsers.map((u, idx) => (
                <div
                  key={u.userId}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {idx + 1}
                  </div>
                  <span className="flex-1 text-sm font-medium">{u.realName}</span>
                  <span className="text-sm text-muted-foreground">
                    {u.saladsPerDelivery}개
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <span>총 {dialogUsers.length}명</span>
            <span>·</span>
            <span>샐러드 총 {dialogUsers.reduce((sum, u) => sum + u.saladsPerDelivery, 0)}개</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SubscriptionStatusView({
  currentPeriod,
  nextPeriod,
  currentCounts,
  nextCounts,
  holidays,
  showBackButton = true,
  showTitle = false,
  isLoggedIn = true,
}: Props) {
  const tabs = useMemo(() => {
    const t: { label: string; period: SubscriptionPeriod | null; counts: Record<string, number> }[] = [];
    if (currentPeriod) {
      t.push({ label: currentPeriod.target_month, period: currentPeriod, counts: currentCounts });
    }
    if (nextPeriod) {
      t.push({ label: nextPeriod.target_month, period: nextPeriod, counts: nextCounts });
    }
    return t;
  }, [currentPeriod, nextPeriod, currentCounts, nextCounts]);

  const [activeTab, setActiveTab] = useState(0);
  const active = tabs[activeTab];

  const monthToggle = tabs.length > 1 && (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab, idx) => (
        <button
          key={tab.label}
          onClick={() => setActiveTab(idx)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === idx
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label.replace(/^\d{4}년\s*/, "")}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {showBackButton && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="icon-sm">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">구독 현황</h1>
          </div>
          {monthToggle}
        </div>
      )}

      {showTitle && !showBackButton && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold">구독 현황</h2>
          </div>
          {monthToggle}
        </div>
      )}

      {!showBackButton && !showTitle && monthToggle && (
        <div className="flex justify-end">{monthToggle}</div>
      )}

      {tabs.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">구독 기간이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <>

          {active?.period && (
            <MonthCalendar
              key={active.label}
              period={active.period}
              counts={active.counts}
              holidays={holidays}
              isLoggedIn={isLoggedIn}
            />
          )}

          <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded border-2 border-primary bg-primary/5" />
              오늘
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3 w-3 rounded border-2 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20" />
              공휴일
            </span>
          </div>
        </>
      )}
    </div>
  );
}
