"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pencil,
  Star,
  UtensilsCrossed,
  Trash2,
  X,
  ThumbsUp,
  MessageCircle,
  Check,
  Clock,
  CalendarX2,
  Loader2,
  Undo2,
  ChevronLeft,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateCompact } from "@/lib/utils";
import { skipDeliveryDates, unskipDeliveryDates, rescheduleDeliveryDates } from "@/lib/actions/subscription";
import { toast } from "sonner";
import type { MenuFavorite, Review, Post, Holiday } from "@/types";
import type { SubscriptionWithDetails } from "./page";

// ─── Delivery Calendar ───────────────────────────────────────────────────────

function DeliveryCalendar({
  deliveryDateStrings,
  skippedDates,
  vacationSkippedDates = [],
  holidays,
  primaryMonth,
}: {
  deliveryDateStrings: string[];
  skippedDates: string[];
  /** Vacation-skipped dates (earned next-month credit) — shown as gray, no strikethrough. */
  vacationSkippedDates?: string[];
  holidays: Holiday[];
  /** YYYY-MM of the subscription's primary month (e.g. "2026-05").
   *  Delivery dates outside this month render as outlined to signal they are carry-over. */
  primaryMonth?: string;
}) {
  const rescheduledSkippedSet = new Set(skippedDates);
  const vacationSkippedSet = new Set(vacationSkippedDates);
  const holidayMap = new Map(holidays.map((h) => [h.holiday_date, h.name]));
  const todayStr = new Date().toISOString().slice(0, 10);

  // Group delivery dates by month (include months touched by any skips)
  const byMonth: Record<string, Set<string>> = {};
  for (const d of deliveryDateStrings) {
    (byMonth[d.slice(0, 7)] ??= new Set()).add(d);
  }
  for (const d of [...skippedDates, ...vacationSkippedDates]) {
    if (!byMonth[d.slice(0, 7)]) byMonth[d.slice(0, 7)] = new Set();
  }

  const monthKeys = Object.keys(byMonth).sort();

  // Default to the first month — the subscription's original month
  const [monthIdx, setMonthIdx] = useState(0);

  if (monthKeys.length === 0) return null;

  const safeIdx = Math.min(monthIdx, monthKeys.length - 1);
  const monthKey = monthKeys[safeIdx];
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateSet = byMonth[monthKey]!;

  const toColIdx = (dow: number) => (dow >= 1 && dow <= 5 ? dow - 1 : -1);

  let firstWeekdayCol = -1;
  for (let d = 1; d <= daysInMonth && firstWeekdayCol === -1; d++) {
    firstWeekdayCol = toColIdx(new Date(year, month - 1, d).getDay());
  }

  type Cell = { day: number } | null;
  const wdCells: Cell[] = Array(Math.max(0, firstWeekdayCol)).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    if (toColIdx(new Date(year, month - 1, d).getDay()) === -1) continue;
    wdCells.push({ day: d });
  }
  while (wdCells.length % 5 !== 0) wdCells.push(null);

  const hasVacationSkips = vacationSkippedDates.some((d) => d.startsWith(monthKey));
  const hasRescheduledSkips = skippedDates.some((d) => d.startsWith(monthKey));
  const hasHolidays = holidays.some((h) => h.holiday_date.startsWith(monthKey));
  // Show "보상 배송일" legend when viewing a non-primary month that has delivery dates
  const hasCarryOver = primaryMonth !== undefined &&
    monthKey !== primaryMonth &&
    Array.from(dateSet).some((d) => d.startsWith(monthKey));
  const multiMonth = monthKeys.length > 1;

  return (
    <div className="space-y-3">
      {/* Month header — chevrons only shown when subscription spans multiple months */}
      <div className="flex items-center justify-center gap-1">
        {multiMonth && (
          <button
            type="button"
            disabled={safeIdx === 0}
            onClick={() => setMonthIdx(safeIdx - 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <span className={`text-center text-sm font-semibold ${multiMonth ? "min-w-[5rem]" : ""}`}>
          {year}년 {month}월
        </span>
        {multiMonth && (
          <button
            type="button"
            disabled={safeIdx === monthKeys.length - 1}
            onClick={() => setMonthIdx(safeIdx + 1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4 rotate-180" />
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-5 text-center">
        {["월", "화", "수", "목", "금"].map((d) => (
          <div key={d} className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground/60">
            {d}
          </div>
        ))}
        {wdCells.map((cell, i) => {
          if (!cell) return <div key={i} className="h-11" />;
          const { day } = cell as { day: number };
          const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const isDelivery = dateSet.has(iso);
          const isVacationSkipped = vacationSkippedSet.has(iso);
          const isRescheduledSkip = rescheduledSkippedSet.has(iso);
          const isHoliday = holidayMap.has(iso);
          const isPast = iso < todayStr;
          // Delivery date that falls outside the subscription's primary month
          const isCarryOver = isDelivery && primaryMonth !== undefined && !iso.startsWith(primaryMonth);

          return (
            <div key={i} className="flex h-11 items-center justify-center">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  isVacationSkipped
                    ? "bg-muted text-muted-foreground/50"
                    : isRescheduledSkip
                      ? "bg-muted text-muted-foreground/50 line-through"
                      : isCarryOver
                        ? "bg-blue-500 font-semibold text-white"
                        : isDelivery
                          ? "bg-primary font-semibold text-primary-foreground"
                          : isHoliday
                            ? "bg-red-100 text-red-500 dark:bg-red-900/20 dark:text-red-400"
                            : isPast
                              ? "text-muted-foreground/40"
                              : "text-foreground/80"
                }`}
              >
                {day}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          선택한 날짜
        </span>
        {hasCarryOver && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
            보상 배송일
          </span>
        )}
        {hasVacationSkips && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            취소 날짜
          </span>
        )}
        {hasRescheduledSkips && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
            취소됨
          </span>
        )}
        {hasHolidays && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            공휴일
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Skip Dialog (shared logic + two trigger variants) ────────────────────────

import { ChevronRight } from "lucide-react";

interface SkipDialogProps {
  subscriptionId: string;
  saladsPerDelivery: number;
  deliveryDateStrings: string[];
  /** Combined all-skipped dates (vacation + reschedule) — used for eligible filter. */
  skippedDates: string[];
  /**
   * Called when an operation completes.
   * @param newlySkipped - Dates that were just marked as skipped.
   * @param type - "vacation" (next-month credit) or "reschedule" (same-month move).
   * @param replacementDates - Dates chosen as replacements (reschedule only). These
   *   are now active delivery dates again, so they must be removed from any skip list.
   */
  onDone: (newlySkipped: string[], type: "vacation" | "reschedule", replacementDates?: string[]) => void;
  deliveryStart?: string;
  deliveryEnd?: string;
  holidays?: Holiday[];
  storeClosureDates?: string[];
}

type DialogStep = "select" | "choose" | "reschedule";

function SkipDialogShell({
  subscriptionId,
  saladsPerDelivery,
  deliveryDateStrings,
  skippedDates,
  onDone,
  deliveryStart,
  deliveryEnd,
  holidays = [],
  storeClosureDates = [],
  trigger,
}: SkipDialogProps & { trigger: (open: () => void, hasEligible: boolean) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<DialogStep>("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replacements, setReplacements] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const cutoff = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  })();

  const skippedSet = new Set(skippedDates);
  const eligible = deliveryDateStrings
    .filter((d) => d >= cutoff && !skippedSet.has(d))
    .sort();

  // Any future weekday in the delivery period that isn't currently being skipped
  // in this dialog is a valid replacement candidate.
  // IMPORTANT: use local-date components (getFullYear/getMonth/getDate) rather
  // than toISOString() which returns a UTC string — for KST (UTC+9) users,
  // midnight local time is already the previous calendar day in UTC, causing a
  // systematic off-by-one that makes every Friday unselectable.
  const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const storeClosureSet = new Set(storeClosureDates);
  const publicHolidaySet = new Set(
    holidays
      .map((h) => h.holiday_date)
      .filter((d) => !storeClosureSet.has(d))
  );
  const isBlockedDate = (iso: string) =>
    storeClosureSet.has(iso) || publicHolidaySet.has(iso);

  const availableForReschedule: string[] = [];
  if (deliveryStart && deliveryEnd) {
    const cur = new Date(deliveryStart + "T00:00:00");
    const end = new Date(deliveryEnd + "T00:00:00");
    while (cur <= end) {
      const dow = cur.getDay();
      const iso = localIso(cur);
      if (
        dow >= 1 &&
        dow <= 5 &&
        iso >= cutoff &&
        !selected.has(iso) &&
        !isBlockedDate(iso)
      ) {
        availableForReschedule.push(iso);
      }
      cur.setDate(cur.getDate() + 1);
    }
  }

  function toggle(date: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  function toggleReplacement(date: string) {
    setReplacements((prev) => {
      const next = new Set(prev);
      next.has(date) ? next.delete(date) : next.add(date);
      return next;
    });
  }

  function formatKR(iso: string) {
    const d = new Date(iso + "T00:00:00");
    const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
    return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAYS[d.getDay()]})`;
  }

  function resetAndClose() {
    setOpen(false);
    setStep("select");
    setSelected(new Set());
    setReplacements(new Set());
  }

  function handleChooseNextMonth() {
    const toSkip = [...selected];
    startTransition(async () => {
      const result = await skipDeliveryDates(subscriptionId, toSkip);
      if (result.error) { toast.error(result.error); return; }
      onDone(toSkip, "vacation");
      resetAndClose();
      const n = toSkip.length * saladsPerDelivery;
      toast.success(`배송 ${toSkip.length}일을 연기했어요. 다음 달 샐러드 ${n}개를 드려요.`);
    });
  }

  function handleConfirmReschedule() {
    const toSkip = [...selected];
    const toAdd = [...replacements];
    startTransition(async () => {
      const result = await rescheduleDeliveryDates(subscriptionId, toSkip, toAdd);
      if (result.error) { toast.error(result.error); return; }
      onDone(toSkip, "reschedule", toAdd);
      resetAndClose();
      toast.success("일정이 저장되었어요.");
    });
  }

  const selectedArr = [...selected].sort();
  const selMonth = selectedArr.length > 0 ? new Date(selectedArr[0] + "T00:00:00").getMonth() + 1 : null;
  const selDayLabels = selectedArr.map((d) => `${new Date(d + "T00:00:00").getDate()}일`).join(", ");
  const nextMonthSaladCount = selected.size * saladsPerDelivery;

  return (
    <>
      {trigger(() => { setSelected(new Set()); setReplacements(new Set()); setStep("select"); setOpen(true); }, eligible.length > 0)}
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="max-w-sm">

          {/* Step 1: Select dates to postpone — calendar view */}
          {step === "select" && (() => {
            const eligibleSet = new Set(eligible);
            const toColIdx = (dow: number) => (dow >= 1 && dow <= 5 ? dow - 1 : -1);
            const start = deliveryStart ? new Date(deliveryStart + "T00:00:00") : null;
            const end = deliveryEnd ? new Date(deliveryEnd + "T00:00:00") : null;
            const mKeys: string[] = [];
            if (start && end) {
              const cur = new Date(start.getFullYear(), start.getMonth(), 1);
              const endM = new Date(end.getFullYear(), end.getMonth(), 1);
              while (cur <= endM) {
                mKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
                cur.setMonth(cur.getMonth() + 1);
              }
            }
            return (
              <>
                <DialogHeader>
                  <DialogTitle>구독 연기</DialogTitle>
                  <DialogDescription>
                    {selected.size === 0 ? "연기할 배송 날짜를 선택해주세요." : `${selected.size}개 날짜를 선택했어요.`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 overflow-y-auto py-1" style={{ maxHeight: "52vh" }}>
                  {mKeys.map((monthKey) => {
                    const [yr, mo] = monthKey.split("-").map(Number);
                    const daysInMonth = new Date(yr, mo, 0).getDate();
                    let firstCol = -1;
                    for (let d = 1; d <= daysInMonth && firstCol === -1; d++) firstCol = toColIdx(new Date(yr, mo - 1, d).getDay());
                    type Cell = { day: number } | null;
                    const cells: Cell[] = Array(Math.max(0, firstCol)).fill(null);
                    for (let d = 1; d <= daysInMonth; d++) {
                      if (toColIdx(new Date(yr, mo - 1, d).getDay()) === -1) continue;
                      cells.push({ day: d });
                    }
                    while (cells.length % 5 !== 0) cells.push(null);
                    return (
                      <div key={monthKey}>
                        <p className="mb-1 text-center text-xs font-semibold text-muted-foreground/70">{mo}월</p>
                        <div className="grid grid-cols-5 text-center">
                          {["월", "화", "수", "목", "금"].map((d) => (
                            <div key={d} className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground/50">{d}</div>
                          ))}
                          {cells.map((cell, i) => {
                            if (!cell) return <div key={i} className="h-11" />;
                            const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
                            const isEligible = eligibleSet.has(iso);
                            const isChosen = selected.has(iso);
                            const isAlreadySkipped = skippedSet.has(iso);
                            let cls = "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ";
                            if (isAlreadySkipped) {
                              cls += "bg-muted text-muted-foreground/50 line-through";
                            } else if (isChosen) {
                              cls += "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1";
                            } else if (isEligible) {
                              cls += "cursor-pointer border border-dashed border-muted-foreground/40 text-foreground hover:border-primary hover:bg-primary/10 hover:text-primary";
                            } else {
                              cls += "text-muted-foreground/30";
                            }
                            return (
                              <div key={i} className="flex h-11 items-center justify-center">
                                <button type="button" disabled={!isEligible} onClick={() => isEligible && toggle(iso)} className={cls}>
                                  {cell.day}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />선택됨</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />취소됨</span>
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button variant="ghost" onClick={resetAndClose}>닫기</Button>
                  <Button onClick={() => setStep("choose")} disabled={selected.size === 0}>다음</Button>
                </DialogFooter>
              </>
            );
          })()}

          {/* Step 2: Choose how to postpone */}
          {step === "choose" && (
            <>
              <DialogHeader>
                <DialogTitle>언제로 연기하고 싶으세요?</DialogTitle>
                {selMonth && (
                  <DialogDescription>
                    {selMonth}월 {selDayLabels} 배송을 연기해요.
                  </DialogDescription>
                )}
              </DialogHeader>
              <div className="space-y-3 py-2">
                <button
                  onClick={handleChooseNextMonth}
                  disabled={isPending}
                  className="w-full rounded-xl border-2 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  <p className="flex items-center gap-2 font-semibold">
                    다음 달로 미룰래요.
                    {isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    다음 달 샐러드 {nextMonthSaladCount}개를 무료로 드려요.
                  </p>
                </button>
                <button
                  onClick={() => setStep("reschedule")}
                  disabled={isPending}
                  className="w-full rounded-xl border-2 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  <p className="font-semibold">이번 달의 다른 날로 미룰래요.</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    이번 달 다른 날짜를 직접 선택해요.
                  </p>
                </button>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep("select")} disabled={isPending}>
                  뒤로
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Step 3: Pick replacement dates — calendar grid */}
          {step === "reschedule" && (() => {
            // Build full Mon-Fri calendar for the delivery period
            const toColIdx = (dow: number) => (dow >= 1 && dow <= 5 ? dow - 1 : -1);
            const beingSkipped = selected;
            const availableSet = new Set(availableForReschedule);
            const hasPublicHolidaysInRange = publicHolidaySet.size > 0;
            const hasStoreClosuresInRange = storeClosureSet.size > 0;

            // Determine month range from deliveryStart / deliveryEnd
            const start = deliveryStart ? new Date(deliveryStart + "T00:00:00") : null;
            const end = deliveryEnd ? new Date(deliveryEnd + "T00:00:00") : null;

            // Collect all months in the range
            const monthKeys: string[] = [];
            if (start && end) {
              const cur = new Date(start.getFullYear(), start.getMonth(), 1);
              const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
              while (cur <= endMonth) {
                monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
                cur.setMonth(cur.getMonth() + 1);
              }
            }

            if (monthKeys.length === 0) {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle>대체 날짜 선택</DialogTitle>
                    <DialogDescription>이번 달 대체 가능한 날짜가 없어요.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setStep("choose")}>뒤로</Button>
                  </DialogFooter>
                </>
              );
            }

            return (
              <>
                <DialogHeader>
                  <DialogTitle>대체 날짜 선택</DialogTitle>
                  <DialogDescription>
                    원하는 날짜를 선택해주세요. ({replacements.size}/{selected.size}개 선택)
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 overflow-y-auto py-1" style={{ maxHeight: "52vh" }}>
                  {monthKeys.map((monthKey) => {
                    const [yr, mo] = monthKey.split("-").map(Number);
                    const daysInMonth = new Date(yr, mo, 0).getDate();

                    let firstWeekdayCol = -1;
                    for (let d = 1; d <= daysInMonth && firstWeekdayCol === -1; d++) {
                      firstWeekdayCol = toColIdx(new Date(yr, mo - 1, d).getDay());
                    }

                    type Cell = { day: number } | null;
                    const cells: Cell[] = Array(Math.max(0, firstWeekdayCol)).fill(null);
                    for (let d = 1; d <= daysInMonth; d++) {
                      if (toColIdx(new Date(yr, mo - 1, d).getDay()) === -1) continue;
                      cells.push({ day: d });
                    }
                    while (cells.length % 5 !== 0) cells.push(null);

                    return (
                      <div key={monthKey}>
                        <p className="mb-1 text-center text-xs font-semibold text-muted-foreground/70">
                          {mo}월
                        </p>
                        <div className="grid grid-cols-5 text-center">
                          {["월", "화", "수", "목", "금"].map((d) => (
                            <div key={d} className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground/50">
                              {d}
                            </div>
                          ))}
                          {cells.map((cell, i) => {
                            if (!cell) return <div key={i} className="h-11" />;
                            const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
                            const isAvailable = availableSet.has(iso);
                            const isChosen = replacements.has(iso);
                            const isFreed = beingSkipped.has(iso);
                            const isStoreClosure = storeClosureSet.has(iso);
                            const isPublicHoliday =
                              !isStoreClosure && publicHolidaySet.has(iso);

                            let circleClass = "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ";
                            if (isFreed) {
                              circleClass += "bg-muted text-muted-foreground/50 line-through";
                            } else if (isChosen) {
                              circleClass += "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1";
                            } else if (isStoreClosure) {
                              circleClass += "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
                            } else if (isPublicHoliday) {
                              circleClass += "bg-red-100 text-red-500 dark:bg-red-900/20 dark:text-red-400";
                            } else if (isAvailable) {
                              circleClass += "cursor-pointer border border-dashed border-muted-foreground/40 text-foreground hover:border-primary hover:bg-primary/10 hover:text-primary";
                            } else {
                              circleClass += "text-muted-foreground/30";
                            }

                            return (
                              <div key={i} className="flex h-11 items-center justify-center">
                                <button
                                  type="button"
                                  disabled={!isAvailable}
                                  onClick={() => isAvailable && toggleReplacement(iso)}
                                  className={circleClass}
                                >
                                  {cell.day}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-primary" />선택됨
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />연기 중
                    </span>
                    {hasPublicHolidaysInRange && (
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400" />공휴일
                      </span>
                    )}
                    {hasStoreClosuresInRange && (
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />가게 휴무
                      </span>
                    )}
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="ghost" onClick={() => setStep("choose")} disabled={isPending}>
                    뒤로
                  </Button>
                  <Button
                    onClick={handleConfirmReschedule}
                    disabled={replacements.size === 0 || isPending}
                    className="gap-2"
                  >
                    {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    확인
                  </Button>
                </DialogFooter>
              </>
            );
          })()}

        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Subscription Card ────────────────────────────────────────────────────────

import { ChevronDown, ChevronUp } from "lucide-react";

export function SubscriptionCard({
  entry,
  onSkipDone,
}: {
  entry: SubscriptionWithDetails;
  onSkipDone?: (newSkipped: string[]) => void;
}) {
  const { subscription, period } = entry;
  const router = useRouter();
  // Vacation skips earn next-month credit; reschedule skips do not.
  const [vacationSkippedDates, setVacationSkippedDates] = useState<string[]>(entry.skippedDates);
  const [rescheduledDates, setRescheduledDates] = useState<string[]>(entry.rescheduledDates);
  const [deliveryDateStrings, setDeliveryDateStrings] = useState<string[]>(
    entry.deliveryDateStrings
  );
  const allSkippedDates = [...vacationSkippedDates, ...rescheduledDates];
  const [calendarOpen, setCalendarOpen] = useState(false);
  const isPaid = subscription.payment_status === "completed";

  // Derive the primary month key (e.g. "2026-05") from target_month
  const primaryMonthKey = (() => {
    const m = period.target_month.match(/(\d{4})년\s*(\d+)월/);
    return m ? `${m[1]}-${m[2].padStart(2, "0")}` : undefined;
  })();

  // Count only deliveries within the primary month — carry-over dates in future
  // months are compensated separately and shouldn't inflate the displayed count.
  const effectiveDeliveryCount = primaryMonthKey
    ? deliveryDateStrings.filter((d) => d.startsWith(primaryMonthKey)).length
    : Math.max(0, entry.deliveryDayCount);
  const totalSalads = effectiveDeliveryCount * (subscription.salads_per_delivery ?? 1);

  const now = new Date();
  const isApplying =
    now >= new Date(period.apply_start) && now <= new Date(period.apply_end);
  const isPaying =
    now >= new Date(period.pay_start) && now <= new Date(period.pay_end);
  const isActionable = isApplying || isPaying;

  const targetMonthShort = period.target_month.replace(/^\d{4}년\s*/, "");

  let title = `${period.target_month} 구독`;
  if (isApplying) title = `${targetMonthShort} 구독 신청 기간`;
  else if (isPaying && !isPaid) title = "결제 기간";

  const formatPayStart = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일부터 결제 가능해요`;
  };

  const formatApplyEnd = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일까지 신청해주세요`;
  };

  let subtitle: string | null = null;
  if (isPaying && !isPaid) subtitle = "결제하고 '결제 완료'를 눌러주세요";
  else if (!isPaid && !isPaying) subtitle = formatPayStart(period.pay_start);
  else if (isApplying) subtitle = formatApplyEnd(period.apply_end);

  const [isUndoing, startUndoTransition] = useTransition();
  const saladsPerDelivery = subscription.salads_per_delivery ?? 1;
  const vacationSkippedCount = vacationSkippedDates.length;
  const nextMonthCredits = vacationSkippedCount * saladsPerDelivery;
  const hasRescheduled = rescheduledDates.length > 0;

  function handleUndoAll() {
    startUndoTransition(async () => {
      const result = await unskipDeliveryDates(subscription.id, vacationSkippedDates);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setVacationSkippedDates([]);
      onSkipDone?.([...rescheduledDates]);
      toast.success("배송 취소가 원복되었어요.");
    });
  }

  const hasDeliveryDates = deliveryDateStrings.length > 0;

  // Shared header used in both simple and enhanced cards
  const statsLine = (
    <span className="text-sm text-muted-foreground">
      주 {subscription.frequency_per_week}회 · 배달당 {saladsPerDelivery}개 · 월 {totalSalads}개
    </span>
  );

  const cardHeader = (
    <div className="flex flex-row items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
        <UtensilsCrossed className="h-5 w-5 text-green-500" />
      </div>
      <div className="flex-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {subtitle
          ? <p className="text-sm text-muted-foreground">{subtitle}</p>
          : statsLine}
      </div>
      {isPaid ? (
        <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <Check className="h-3 w-3" />결제 완료
        </Badge>
      ) : (
        <Badge variant="secondary" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock className="h-3 w-3" />결제 대기
        </Badge>
      )}
    </div>
  );

  if (!hasDeliveryDates) {
    return (
      <Link href={`/subscription?period=${period.id}`} className="block">
        <Card className={`transition-colors hover:bg-accent/50 active:bg-accent/70 touch-manipulation ${isActionable && !isPaid ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
          <CardHeader className="space-y-0 pb-3">{cardHeader}</CardHeader>
        </Card>
      </Link>
    );
  }

  return (
    <Card className={`${isActionable && !isPaid ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
      {/* Clickable header links to subscription page */}
      <CardHeader className="space-y-0 pb-2 transition-colors hover:bg-accent/50 active:bg-accent/70 rounded-t-xl touch-manipulation">
        <Link href={`/subscription?period=${period.id}`} className="block">
          {cardHeader}
        </Link>
      </CardHeader>

      <CardContent className="space-y-3 pt-0">
        <Separator />

        {/* Collapsible calendar section */}
        <button
          onClick={() => setCalendarOpen((v) => !v)}
          className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between rounded-lg px-1 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground active:bg-accent/70 active:text-foreground touch-manipulation"
        >
          <span>배송 일정</span>
          {calendarOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {calendarOpen && (
          <>
            <DeliveryCalendar
              deliveryDateStrings={deliveryDateStrings}
              skippedDates={rescheduledDates}
              vacationSkippedDates={vacationSkippedDates}
              holidays={entry.holidays ?? []}
              primaryMonth={primaryMonthKey}
            />

            {/* Vacation skip banner — shown only when next-month credit applies */}
            {vacationSkippedCount > 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 dark:bg-amber-950/30">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  이번달 샐러드 {vacationSkippedCount * saladsPerDelivery}개 배송을 취소했어요. 다음 달{" "}
                  {nextMonthCredits}개를 무료로 넣어드려요.
                </p>
              </div>
            )}

            {/* Reschedule confirmation — shown when same-month date change was saved */}
            {hasRescheduled && vacationSkippedCount === 0 && (
              <p className="text-sm text-muted-foreground">일정이 저장되었어요.</p>
            )}

            {/* Action buttons — skip + optional undo */}
            {isPaid && (() => {
              const cutoffIso = (() => {
                const d = new Date();
                d.setDate(d.getDate() + 2);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              })();
              const canUndo = vacationSkippedDates.some((d) => d >= cutoffIso);

              return (
                <div className="flex gap-2 pt-1">
                  <SkipDialogShell
                    subscriptionId={subscription.id}
                    saladsPerDelivery={saladsPerDelivery}
                    deliveryDateStrings={entry.deliveryDateStrings}
                    skippedDates={allSkippedDates}
                    deliveryStart={period.delivery_start ?? undefined}
                    deliveryEnd={period.delivery_end ?? undefined}
                    holidays={entry.holidays ?? []}
                    storeClosureDates={entry.storeClosureDates ?? []}
                    onDone={(newlySkipped, type, replacements = []) => {
                      const replacedSet = new Set(replacements);
                      if (type === "vacation") {
                        setVacationSkippedDates((prev) => [
                          ...prev.filter((d) => !replacedSet.has(d)),
                          ...newlySkipped,
                        ]);
                        setDeliveryDateStrings((prev) =>
                          prev.filter((d) => !newlySkipped.includes(d))
                        );
                      } else {
                        setVacationSkippedDates((prev) =>
                          prev.filter((d) => !replacedSet.has(d))
                        );
                        setRescheduledDates((prev) => [
                          ...prev.filter((d) => !replacedSet.has(d)),
                          ...newlySkipped,
                        ]);
                        setDeliveryDateStrings((prev) => [
                          ...prev.filter((d) => !newlySkipped.includes(d)),
                          ...replacements,
                        ]);
                      }
                      const nextAllSkipped = [
                        ...vacationSkippedDates.filter((d) => !replacedSet.has(d)),
                        ...rescheduledDates.filter((d) => !replacedSet.has(d)),
                        ...newlySkipped,
                      ];
                      onSkipDone?.(nextAllSkipped);
                      router.refresh();
                    }}
                    trigger={(open, hasEligible) =>
                      hasEligible ? (
                        <Button
                          variant="outline"
                          onClick={open}
                          className="h-12 flex-1 gap-1.5"
                        >
                          <CalendarX2 className="h-4 w-4" />
                          구독 연기
                        </Button>
                      ) : null
                    }
                  />
                  {vacationSkippedCount > 0 && canUndo && (
                    <Button
                      variant="outline"
                      onClick={handleUndoAll}
                      disabled={isUndoing}
                      className="h-12 flex-1 gap-1.5"
                    >
                      {isUndoing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4" />
                      )}
                      되돌리기
                    </Button>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function FavoriteItem({
  fav,
  onRemove,
  showSeparator = false,
}: {
  fav: MenuFavorite;
  onRemove?: (menuId: string) => void;
  showSeparator?: boolean;
}) {
  const menu = fav.menu as any;
  if (!menu) return null;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/menu/${menu.id}`} className="flex-shrink-0">
          {menu.image_url ? (
            <Image
              src={menu.image_url}
              alt={menu.title}
              width={40}
              height={40}
              sizes="40px"
              className="h-10 w-10 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </Link>
        <Link href={`/menu/${menu.id}`} className="min-w-0 flex-1">
          <p className="text-sm font-medium">{menu.title}</p>
          {menu.sauce && (
            <p className="text-sm text-muted-foreground">{menu.sauce}</p>
          )}
        </Link>
        {onRemove && (
          <button
            onClick={() => onRemove(menu.id)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showSeparator && <Separator />}
    </div>
  );
}

export function ReviewItem({
  review,
  onEdit,
  onDelete,
}: {
  review: Review;
  onEdit?: (review: Review) => void;
  onDelete?: (reviewId: string) => void;
}) {
  const menu = review.menu;

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          {menu?.image_url ? (
            <Link href={`/menu/${menu.id}`} className="flex-shrink-0">
              <Image
                src={menu.image_url}
                alt={menu.title ?? ""}
                width={48}
                height={48}
                sizes="48px"
                className="h-12 w-12 rounded-md object-cover"
              />
            </Link>
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-muted">
              <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{menu?.title ?? "메뉴"}</p>
              {(onEdit || onDelete) && (
                <div className="flex items-center gap-0.5">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(review)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(review.id)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`h-3.5 w-3.5 ${
                    n <= review.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
              <span className="ml-1 text-xs text-muted-foreground">
                {formatDateCompact(review.pickup_date)}
              </span>
            </div>
            {review.comment && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {review.comment}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PostItem({
  post,
  onDelete,
}: {
  post: Post;
  onDelete?: (postId: string) => void;
}) {
  return (
    <Link href={`/community/${post.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{post.title}</p>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {new Date(post.created_at).toLocaleDateString("ko-KR")}
                </span>
                <div className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" />
                  {post.vote_count}
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {post.comment_count ?? 0}
                </div>
              </div>
            </div>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(post.id);
                }}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
