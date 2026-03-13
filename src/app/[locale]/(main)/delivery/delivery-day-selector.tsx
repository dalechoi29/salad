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
  Zap,
  Home,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateISO } from "@/lib/utils";
import type { Subscription, DeliveryDay, Holiday } from "@/types";

interface DeliveryDaySelectorProps {
  subscription: Subscription;
  deliveryDays: DeliveryDay[];
  holidays: Holiday[];
  periodMonth: string;
  deliveryStart: string | null;
  deliveryEnd: string | null;
}

const DAY_LABELS = ["월", "화", "수", "목", "금"];
const WEEKS_PER_MONTH = 4;

const PRESETS: Record<number, { label: string; days: number[] }[]> = {
  1: [
    { label: "매주 월", days: [1] },
    { label: "매주 화", days: [2] },
    { label: "매주 수", days: [3] },
    { label: "매주 목", days: [4] },
    { label: "매주 금", days: [5] },
  ],
  2: [
    { label: "매주 화/목", days: [2, 4] },
    { label: "매주 월/수", days: [1, 3] },
    { label: "매주 수/금", days: [3, 5] },
    { label: "매주 월/목", days: [1, 4] },
  ],
  3: [
    { label: "매주 월/수/금", days: [1, 3, 5] },
    { label: "매주 화/목/금", days: [2, 4, 5] },
    { label: "매주 월/화/목", days: [1, 2, 4] },
  ],
  4: [
    { label: "매주 월/화/목/금", days: [1, 2, 4, 5] },
    { label: "매주 월/수/목/금", days: [1, 3, 4, 5] },
  ],
  5: [{ label: "매주 월~금", days: [1, 2, 3, 4, 5] }],
};

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
}: DeliveryDaySelectorProps) {
  const maxDays = subscription.frequency_per_week;

  const initialSavedTotal = useMemo(
    () => deliveryDays.reduce((sum, d) => sum + d.selected_days.length, 0),
    [deliveryDays]
  );
  const appliedTotal = subscription.total_delivery_days ?? initialSavedTotal;

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

  const initialMonday = deliveryStartDate
    ? getMonday(deliveryStartDate)
    : getMonday(new Date());

  const [currentMonday, setCurrentMonday] = useState(initialMonday);
  const [isLoading, setIsLoading] = useState(false);

  const holidaySet = new Set(holidays.map((h) => h.holiday_date));
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.name]));

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

  function applyPreset(presetDays: number[]) {
    if (!firstMonday || !lastMonday) return;

    const newSelections: Record<string, number[]> = {};
    let total = 0;

    const cursor = new Date(firstMonday);
    while (cursor <= lastMonday) {
      const weekStr = formatDateISO(cursor);
      const validDays: number[] = [];

      for (const day of presetDays) {
        if (appliedTotal > 0 && total >= appliedTotal) break;

        const date = new Date(cursor);
        date.setDate(date.getDate() + day - 1);

        if (deliveryStartDate && date < deliveryStartDate) continue;
        if (deliveryEndDate && date > deliveryEndDate) continue;
        if (holidaySet.has(formatDateISO(date))) continue;

        validDays.push(day);
        total++;
      }

      if (validDays.length > 0) {
        newSelections[weekStr] = validDays;
      }

      cursor.setDate(cursor.getDate() + 7);
    }

    setWeekSelections(newSelections);
    toast.success(`${total}일 자동 선택됨`);
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

  const isPastWeek = currentMonday < getMonday(new Date());
  const presets = PRESETS[maxDays] ?? [];
  const appliedSalads = appliedTotal * subscription.salads_per_delivery;
  const isFull = totalSelectedDays >= appliedTotal;

  const activePresetLabel = useMemo(() => {
    if (!firstMonday || !lastMonday) return null;

    for (const preset of presets) {
      const expectedSelections: Record<string, number[]> = {};
      const cursor = new Date(firstMonday);
      while (cursor <= lastMonday) {
        const weekStr = formatDateISO(cursor);
        const validDays: number[] = [];
        for (const day of preset.days) {
          const date = new Date(cursor);
          date.setDate(date.getDate() + day - 1);
          if (deliveryStartDate && date < deliveryStartDate) continue;
          if (deliveryEndDate && date > deliveryEndDate) continue;
          if (holidaySet.has(formatDateISO(date))) continue;
          validDays.push(day);
        }
        if (validDays.length > 0) {
          expectedSelections[weekStr] = validDays;
        }
        cursor.setDate(cursor.getDate() + 7);
      }

      const allKeys = new Set([
        ...Object.keys(weekSelections),
        ...Object.keys(expectedSelections),
      ]);
      let matches = true;
      for (const key of allKeys) {
        const current = (weekSelections[key] ?? []).slice().sort((a, b) => a - b);
        const expected = (expectedSelections[key] ?? []).slice().sort((a, b) => a - b);
        if (
          current.length !== expected.length ||
          current.some((d, i) => d !== expected[i])
        ) {
          matches = false;
          break;
        }
      }
      if (matches) return preset.label;
    }
    return null;
  }, [weekSelections, presets, firstMonday, lastMonday, deliveryStartDate, deliveryEndDate, holidaySet]);

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

      {/* Quick Presets */}
      {presets.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Zap className="h-3.5 w-3.5" />
            <span>빠른 선택</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset.days)}
                className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  activePresetLabel === preset.label
                    ? "border-primary bg-primary/10 text-primary"
                    : "hover:bg-primary/10 hover:border-primary/30 hover:text-primary"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

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
              const disabled = holiday || isPastWeek || outOfRange;
              const selected = currentSelection.includes(dayNum);
              const dateObj = getDateForDay(i);
              const dateNum = dateObj.getDate();
              const hName = getHolidayName(i);

              return (
                <button
                  key={i}
                  onClick={() => !disabled && toggleDay(i)}
                  disabled={disabled}
                  className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all overflow-hidden ${
                    holiday
                      ? "border-red-200 bg-red-50 text-red-400 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-500"
                      : outOfRange || isPastWeek
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
          <span className="h-3 w-3 rounded border-2 border-muted bg-background" />
          선택 가능
        </span>
      </div>
    </div>
  );
}
