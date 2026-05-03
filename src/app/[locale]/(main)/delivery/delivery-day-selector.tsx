"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { saveDeliveryDays } from "@/lib/actions/delivery";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  Save,
  Home,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateISO, isSelectionClosed } from "@/lib/utils";
import type { Subscription, DeliveryDay, Holiday } from "@/types";

interface DeliveryDaySelectorProps {
  subscription: Subscription;
  deliveryDays: DeliveryDay[];
  holidays: Holiday[];
  periodMonth: string;
  deliveryStart: string | null;
  deliveryEnd: string | null;
  replacementMode?: boolean;
  remainingSlots?: number;
  cutoffDay?: number;
  cutoffTime?: string;
  deadlineOverrides?: Record<string, string>;
}

const DAY_LABELS = ["월", "화", "수", "목", "금"];
const WEEKS_PER_MONTH = 4;

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

export function DeliveryDaySelector({
  subscription,
  deliveryDays,
  holidays,
  periodMonth,
  deliveryStart,
  deliveryEnd,
  replacementMode = false,
  remainingSlots = 0,
  cutoffDay = 4,
  cutoffTime = "23:59",
  deadlineOverrides = {},
}: DeliveryDaySelectorProps) {
  const maxDays = subscription.frequency_per_week;

  const initialSavedTotal = useMemo(
    () => deliveryDays.reduce((sum, d) => sum + d.selected_days.length, 0),
    [deliveryDays]
  );
  const appliedTotal =
    ((subscription.total_delivery_days ?? 0) ||
      subscription.frequency_per_week * WEEKS_PER_MONTH ||
      initialSavedTotal) + (subscription.carryover_delivery_days ?? 0);

  const deliveryStartDate = deliveryStart
    ? new Date(deliveryStart + "T00:00:00")
    : null;
  const deliveryEndDate = deliveryEnd
    ? new Date(deliveryEnd + "T00:00:00")
    : null;

  const firstMonday = deliveryStartDate
    ? getMonday(deliveryStartDate)
    : null;
  const lastMonday = deliveryEndDate ? getMonday(deliveryEndDate) : null;

  const initialMonday = (() => {
    const today = new Date();
    if (replacementMode) {
      if (deliveryStartDate && today < deliveryStartDate) {
        return getMonday(deliveryStartDate);
      }
      if (deliveryEndDate && today > deliveryEndDate) {
        return getMonday(deliveryEndDate);
      }
      return getMonday(today);
    }
    return deliveryStartDate ? getMonday(deliveryStartDate) : getMonday(today);
  })();

  const [currentMonday, setCurrentMonday] = useState(initialMonday);
  const [isLoading, setIsLoading] = useState(false);

  const holidaySet = new Set(holidays.map((h) => h.holiday_date));
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const storeClosureSet = new Set(
    holidays
      .filter((h) => h.source === "store_closure")
      .map((h) => h.holiday_date)
  );

  const savedMap = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const d of deliveryDays) {
      map[d.week_start] = d.selected_days;
    }
    return map;
  }, [deliveryDays]);

  const [weekSelections, setWeekSelections] = useState<
    Record<string, number[]>
  >(() => {
    const holidayDaysByWeek: Record<string, Set<number>> = {};
    for (const h of holidays) {
      const date = new Date(h.holiday_date + "T00:00:00");
      const dow = date.getDay();
      if (dow === 0 || dow === 6) continue;
      const monday = getMonday(date);
      const weekStr = formatDateISO(monday);
      if (!holidayDaysByWeek[weekStr]) holidayDaysByWeek[weekStr] = new Set();
      holidayDaysByWeek[weekStr].add(dow);
    }

    const filtered: Record<string, number[]> = {};
    for (const [weekStr, days] of Object.entries(savedMap)) {
      const hSet = holidayDaysByWeek[weekStr];
      filtered[weekStr] = hSet
        ? days.filter((d) => !hSet.has(d))
        : [...days];
    }
    return filtered;
  });

  const weekStartStr = formatDateISO(currentMonday);
  const currentSelection = weekSelections[weekStartStr] ?? [];

  const totalSelectedDays = useMemo(() => {
    let count = 0;
    for (const days of Object.values(weekSelections)) {
      count += days.length;
    }
    return count;
  }, [weekSelections]);

  const hasUnsavedChanges = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(weekSelections),
      ...Object.keys(savedMap),
    ]);
    for (const key of allKeys) {
      const current = weekSelections[key] ?? [];
      const saved = savedMap[key] ?? [];
      if (
        current.length !== saved.length ||
        current.some((d, i) => d !== saved[i])
      ) {
        return true;
      }
    }
    return false;
  }, [weekSelections, savedMap]);

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

  function isDayHoliday(dayIndex: number): boolean {
    const date = getDateForDay(dayIndex);
    return holidaySet.has(formatDateISO(date));
  }

  function getHolidayName(dayIndex: number): string | undefined {
    const date = getDateForDay(dayIndex);
    return holidayMap.get(formatDateISO(date));
  }

  function getWeekStartISO(dateStr: string): string {
    const d = new Date(dateStr + "T00:00:00");
    return formatDateISO(getMonday(d));
  }

  function isDateCutoffClosed(dateStr: string): boolean {
    const override = deadlineOverrides[getWeekStartISO(dateStr)];
    if (override) return new Date() >= new Date(override);
    return isSelectionClosed(dateStr, cutoffDay, cutoffTime);
  }

  function getGlobalTotal(selections: Record<string, number[]>): number {
    let count = 0;
    for (const days of Object.values(selections)) {
      count += days.length;
    }
    return count;
  }

  function toggleDay(dayIndex: number) {
    const day = dayIndex + 1;
    setWeekSelections((prev) => {
      const current = prev[weekStartStr] ?? [];
      if (current.includes(day)) {
        const updated = current.filter((d) => d !== day);
        return { ...prev, [weekStartStr]: updated };
      }
      if (current.length >= maxDays) {
        toast.error(`주당 최대 ${maxDays}일까지 선택할 수 있습니다`);
        return prev;
      }
      if (appliedTotal > 0 && getGlobalTotal(prev) >= appliedTotal) {
        toast.error(`이번 달 최대 ${appliedTotal}일까지 선택할 수 있습니다`);
        return prev;
      }
      return { ...prev, [weekStartStr]: [...current, day].sort() };
    });
  }

  const canGoPrev = firstMonday ? currentMonday > firstMonday : true;
  const canGoNext = lastMonday ? currentMonday < lastMonday : true;

  function navigateWeek(direction: number) {
    const newMonday = new Date(currentMonday);
    newMonday.setDate(newMonday.getDate() + direction * 7);

    if (direction < 0 && firstMonday && newMonday < firstMonday) return;
    if (direction > 0 && lastMonday && newMonday > lastMonday) return;

    setCurrentMonday(newMonday);
  }

  async function handleSaveAll() {
    setIsLoading(true);
    try {
      const allKeys = new Set([
        ...Object.keys(weekSelections),
        ...Object.keys(savedMap),
      ]);

      let errors = 0;
      for (const key of allKeys) {
        const current = weekSelections[key] ?? [];
        const saved = savedMap[key] ?? [];
        const changed =
          current.length !== saved.length ||
          current.some((d, i) => d !== saved[i]);

        if (changed) {
          const result = await saveDeliveryDays(
            subscription.id,
            key,
            current
          );
          if (result.error) {
            errors++;
            toast.error(`${key}: ${result.error}`);
          }
        }
      }

      if (errors === 0) {
        toast.success("모든 배달 요일이 저장되었습니다");
      }
    } finally {
      setIsLoading(false);
    }
  }

  const todayIso = formatDateISO(new Date());
  const isPastWeek = currentMonday < getMonday(new Date());
  const appliedSalads = appliedTotal * subscription.salads_per_delivery;
  const isFull = totalSelectedDays >= appliedTotal;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">배달 요일 선택</h1>
        <p className="text-sm text-muted-foreground">
          {periodMonth} · 주 {maxDays}회 배달
          {deliveryStartDate && deliveryEndDate && (
            <span>
              {" · "}
              {deliveryStartDate.toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              })}
              {" ~ "}
              {deliveryEndDate.toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
        </p>
      </div>

      {replacementMode && remainingSlots > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40">
          <CardContent className="py-3 text-sm text-amber-800 dark:text-amber-300">
            선택한 날짜에 매장이 잠시 쉬어가요. {remainingSlots}일을 다시 선택할 수 있어요.
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-sm text-muted-foreground">신청 샐러드</p>
            <p className="text-xl font-bold">
              {appliedSalads}
              <span className="text-sm font-normal text-muted-foreground">
                개
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-sm text-muted-foreground">선택한 날짜</p>
            <p className="text-xl font-bold">
              <span className={isFull ? "text-green-600" : ""}>
                {totalSelectedDays}
              </span>
              <span className="text-sm font-normal text-muted-foreground">
                /{appliedTotal}일
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Week Navigator */}
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
            <CardTitle className="text-base">
              {formatWeekRange(currentMonday)}
            </CardTitle>
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
        <CardContent className="space-y-4">
          <div className="grid grid-cols-5 gap-2">
            {DAY_LABELS.map((label, i) => {
              const dayNum = i + 1;
              const holiday = isDayHoliday(i);
              const outOfRange = isOutOfRange(i);
              const selected = currentSelection.includes(dayNum);
              const dateObj = getDateForDay(i);
              const dateNum = dateObj.getDate();
              const hName = getHolidayName(i);
              const dateStr = formatDateISO(dateObj);
              const isStoreClosure = storeClosureSet.has(dateStr);
              const isPastDate = dateStr < todayIso;
              const cutoffClosed = isDateCutoffClosed(dateStr);
              const disabled = holiday || isPastDate || outOfRange || cutoffClosed;

              return (
                <button
                  key={i}
                  onClick={() => !disabled && toggleDay(i)}
                  disabled={disabled}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all overflow-hidden ${
                    isStoreClosure
                      ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-500"
                      : holiday
                        ? "border-red-200 bg-red-50 text-red-400 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-500"
                      : outOfRange || isPastDate || cutoffClosed
                        ? "border-muted bg-muted/30 text-muted-foreground opacity-50"
                        : selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted bg-background text-foreground hover:border-primary/50 hover:bg-primary/5"
                  }`}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-lg font-semibold">{dateNum}</span>
                  {holiday && hName ? (
                    <span className="w-full text-[9px] leading-tight text-center truncate">
                      {hName}
                    </span>
                  ) : cutoffClosed ? (
                    <span className="w-full text-[9px] leading-tight text-center truncate">
                      마감
                    </span>
                  ) : selected ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <span className="h-3.5" />
                  )}
                </button>
              );
            })}
          </div>

          {isPastWeek && (
            <p className="text-center text-sm text-muted-foreground">
              지난 주는 수정할 수 없습니다
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Link href="/" className="flex-shrink-0">
          <Button variant="outline" className="h-12 text-base">
            <Home className="mr-2 h-4 w-4" />
            홈
          </Button>
        </Link>
        <Button
          className="h-12 flex-1 text-base"
          onClick={handleSaveAll}
          disabled={isLoading || !hasUnsavedChanges}
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          저장
        </Button>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border-2 border-primary bg-primary/10" />
          선택됨
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border-2 border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20" />
          공휴일
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border-2 border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20" />
          매장 휴무
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border-2 border-muted bg-background" />
          선택 가능
        </span>
      </div>
    </div>
  );
}
