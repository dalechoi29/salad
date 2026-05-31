"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  ArrowLeft,
  User,
  CalendarDays,
  CalendarX2,
  Undo2,
  Loader2,
  Gift,
  Check,
  Clock,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  adminSkipDeliveryDates,
  adminUnskipDeliveryDates,
  adminRescheduleDeliveryDates,
} from "@/lib/actions/admin";
import type {
  AdminUserDetail,
  AdminUserSubscriptionEntry,
} from "@/lib/actions/admin";

// ─── Delivery Calendar (Mon–Fri, matches /my page style) ─────────────────────

const WEEKDAY_LABELS = ["월", "화", "수", "목", "금"];

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function MiniCalendar({
  deliveryDateStrings,
  skippedDates,
  rescheduledDates,
}: {
  deliveryDateStrings: string[];
  skippedDates: string[];
  rescheduledDates: string[];
}) {
  if (deliveryDateStrings.length === 0 && skippedDates.length === 0 && rescheduledDates.length === 0)
    return (
      <p className="text-sm text-muted-foreground">선택된 배송일이 없어요.</p>
    );

  const deliverySet = new Set(deliveryDateStrings);
  const skippedSet = new Set(skippedDates);
  const rescheduledSet = new Set(rescheduledDates);

  // Determine the month to display from all relevant dates
  const allDates = [...deliveryDateStrings, ...skippedDates, ...rescheduledDates].sort();
  if (allDates.length === 0) return null;
  const [year, month] = allDates[0].slice(0, 7).split("-").map(Number);

  // Find the Monday of the first week that has any relevant date in this month
  const firstOfMonth = new Date(year, month - 1, 1);
  const firstDow = firstOfMonth.getDay(); // 0=Sun…6=Sat
  const offsetToMonday = firstDow === 0 ? -6 : 1 - firstDow;
  const firstMonday = new Date(firstOfMonth);
  firstMonday.setDate(firstOfMonth.getDate() + offsetToMonday);

  // Build weeks until we've passed the end of the month
  const weeks: Date[][] = [];
  const cur = new Date(firstMonday);
  const lastOfMonth = new Date(year, month, 0);
  while (cur <= lastOfMonth) {
    const week: Date[] = [];
    for (let i = 0; i < 5; i++) {
      week.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    cur.setDate(cur.getDate() + 2); // skip weekend
    weeks.push(week);
  }

  const todayIso = localIso(new Date());

  return (
    <div>
      <div className="grid grid-cols-5 gap-1 text-center text-xs mb-1">
        {WEEKDAY_LABELS.map((l) => (
          <span key={l} className="py-1 font-medium text-muted-foreground/70 text-[11px]">
            {l}
          </span>
        ))}
      </div>
      <div className="space-y-0.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-5 text-center">
            {week.map((date, di) => {
              const iso = localIso(date);
              const inMonth = date.getMonth() + 1 === month;
              const isDelivery = deliverySet.has(iso);
              const isSkipped = skippedSet.has(iso);
              const isRescheduled = rescheduledSet.has(iso);
              const isPast = iso < todayIso;

              if (!inMonth && !isDelivery && !isSkipped && !isRescheduled) {
                return <div key={di} className="flex h-9 items-center justify-center" />;
              }

              if (isSkipped || isRescheduled) {
                return (
                  <div key={di} className="flex h-9 items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground/60 text-sm line-through">
                      {date.getDate()}
                    </span>
                  </div>
                );
              }
              if (isDelivery) {
                return (
                  <div key={di} className="flex h-9 items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
                      {date.getDate()}
                    </span>
                  </div>
                );
              }
              return (
                <div key={di} className="flex h-9 items-center justify-center">
                  <span className={`text-sm ${inMonth ? (isPast ? "text-muted-foreground/40" : "text-foreground/70") : "text-muted-foreground/20"}`}>
                    {date.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="mt-3 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-primary" />
          선택한 날짜
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted" />
          취소됨
        </span>
      </div>
    </div>
  );
}

// ─── Skip / Unskip Panel ──────────────────────────────────────────────────────

type AdminDialogStep = "select" | "choose" | "reschedule";

function AdminSkipPanel({
  userId,
  entry,
}: {
  userId: string;
  entry: AdminUserSubscriptionEntry;
}) {
  const [vacationSkippedDates, setVacationSkippedDates] = useState<string[]>(entry.skippedDates);
  const [rescheduledDates, setRescheduledDates] = useState<string[]>(entry.rescheduledDates);
  const allSkippedDates = [...vacationSkippedDates, ...rescheduledDates];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [step, setStep] = useState<AdminDialogStep>("select");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replacements, setReplacements] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [isUndoing, startUndoTransition] = useTransition();

  const saladsPerDelivery = entry.subscription.saladsPerDelivery;
  const skippedSet = new Set(allSkippedDates);

  // Admin has no 2-day cutoff — all non-skipped delivery dates are eligible
  const eligible = entry.deliveryDateStrings.filter((d) => !skippedSet.has(d)).sort();

  const localIsoHelper = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const availableForReschedule: string[] = [];
  if (entry.deliveryStart && entry.deliveryEnd) {
    const cur = new Date(entry.deliveryStart + "T00:00:00");
    const end = new Date(entry.deliveryEnd + "T00:00:00");
    while (cur <= end) {
      const dow = cur.getDay();
      const iso = localIsoHelper(cur);
      if (dow >= 1 && dow <= 5 && !selected.has(iso)) {
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
    setDialogOpen(false);
    setStep("select");
    setSelected(new Set());
    setReplacements(new Set());
  }

  function handleChooseNextMonth() {
    const toSkip = [...selected];
    startTransition(async () => {
      const result = await adminSkipDeliveryDates(userId, entry.subscription.id, toSkip);
      if (result.error) { toast.error(result.error); return; }
      setVacationSkippedDates((prev) => [...prev, ...toSkip]);
      resetAndClose();
      const n = toSkip.length * saladsPerDelivery;
      toast.success(`배송 ${toSkip.length}일을 연기했어요. 다음 달 샐러드 ${n}개를 드려요.`);
    });
  }

  function handleConfirmReschedule() {
    const toSkip = [...selected];
    const toAdd = [...replacements];
    startTransition(async () => {
      const result = await adminRescheduleDeliveryDates(userId, entry.subscription.id, toSkip, toAdd);
      if (result.error) { toast.error(result.error); return; }
      const replacedSet = new Set(toAdd);
      setVacationSkippedDates((prev) => prev.filter((d) => !replacedSet.has(d)));
      setRescheduledDates((prev) => [
        ...prev.filter((d) => !replacedSet.has(d)),
        ...toSkip,
      ]);
      resetAndClose();
      toast.success("일정이 저장되었어요.");
    });
  }

  function handleUndoAll() {
    startUndoTransition(async () => {
      const result = await adminUnskipDeliveryDates(userId, entry.subscription.id, vacationSkippedDates);
      if (result.error) { toast.error(result.error); return; }
      setVacationSkippedDates([]);
      toast.success("배송 취소가 원복되었어요.");
    });
  }

  const selectedArr = [...selected].sort();
  const selMonth = selectedArr.length > 0 ? new Date(selectedArr[0] + "T00:00:00").getMonth() + 1 : null;
  const selDayLabels = selectedArr.map((d) => `${new Date(d + "T00:00:00").getDate()}일`).join(", ");
  const nextMonthSaladCount = selected.size * saladsPerDelivery;

  // Build reschedule calendar
  const toColIdx = (dow: number) => (dow >= 1 && dow <= 5 ? dow - 1 : -1);
  const availableSet = new Set(availableForReschedule);
  const monthKeys: string[] = [];
  if (entry.deliveryStart && entry.deliveryEnd) {
    const cur = new Date(new Date(entry.deliveryStart + "T00:00:00").getFullYear(), new Date(entry.deliveryStart + "T00:00:00").getMonth(), 1);
    const endMonth = new Date(new Date(entry.deliveryEnd + "T00:00:00").getFullYear(), new Date(entry.deliveryEnd + "T00:00:00").getMonth(), 1);
    while (cur <= endMonth) {
      monthKeys.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  return (
    <div className="space-y-4">
      <MiniCalendar
        deliveryDateStrings={entry.deliveryDateStrings}
        skippedDates={vacationSkippedDates}
        rescheduledDates={rescheduledDates}
      />

      {vacationSkippedDates.length > 0 && (
        <div className="rounded-lg bg-muted/60 px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">
            이번달 샐러드 {vacationSkippedDates.length * saladsPerDelivery}개 배송을 취소했어요.{" "}
            <span className="text-muted-foreground font-normal">
              다음 달 {vacationSkippedDates.length * saladsPerDelivery}개를 무료로 넣어드려요.
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...vacationSkippedDates].sort().map((d) => (
              <Badge key={d} variant="outline" className="gap-1 text-xs text-muted-foreground">
                {formatKR(d)}
              </Badge>
            ))}
          </div>
          <button
            onClick={handleUndoAll}
            disabled={isUndoing}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isUndoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
            취소 원복하기
          </button>
        </div>
      )}

      {rescheduledDates.length > 0 && vacationSkippedDates.length === 0 && (
        <p className="text-sm text-muted-foreground">일정이 저장되었어요.</p>
      )}

      {eligible.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => { setSelected(new Set()); setReplacements(new Set()); setStep("select"); setDialogOpen(true); }}
        >
          <CalendarX2 className="h-4 w-4" />
          배송 취소 추가
        </Button>
      )}

      <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="max-w-sm">

          {/* Step 1: Select dates — calendar view */}
          {step === "select" && (
            <>
              <DialogHeader>
                <DialogTitle>배송 연기 (관리자)</DialogTitle>
                <DialogDescription>
                  {selected.size === 0 ? "연기할 배송 날짜를 선택해주세요." : `${selected.size}개 날짜를 선택했어요.`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 overflow-y-auto py-1" style={{ maxHeight: "52vh" }}>
                {monthKeys.map((monthKey) => {
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
                  const eligibleSet = new Set(eligible);
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
          )}

          {/* Step 2: Choose next month or same month */}
          {step === "choose" && (
            <>
              <DialogHeader>
                <DialogTitle>언제로 연기하고 싶으세요?</DialogTitle>
                {selMonth && (
                  <DialogDescription>{selMonth}월 {selDayLabels} 배송을 연기해요.</DialogDescription>
                )}
              </DialogHeader>
              <div className="space-y-3 py-2">
                <button
                  onClick={handleChooseNextMonth}
                  disabled={isPending}
                  className="w-full rounded-xl border-2 p-4 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  <p className="font-semibold">다음 달로 미룰래요.</p>
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
                  <p className="mt-0.5 text-sm text-muted-foreground">이번 달 다른 날짜를 직접 선택해요.</p>
                </button>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setStep("select")} disabled={isPending}>뒤로</Button>
                {isPending && <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
              </DialogFooter>
            </>
          )}

          {/* Step 3: Pick replacement dates */}
          {step === "reschedule" && (
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
                      <p className="mb-1 text-center text-xs font-semibold text-muted-foreground/70">{mo}월</p>
                      <div className="grid grid-cols-5 text-center">
                        {["월", "화", "수", "목", "금"].map((d) => (
                          <div key={d} className="flex h-7 items-center justify-center text-xs font-medium text-muted-foreground/50">{d}</div>
                        ))}
                        {cells.map((cell, i) => {
                          if (!cell) return <div key={i} className="h-11" />;
                          const iso = `${yr}-${String(mo).padStart(2, "0")}-${String(cell.day).padStart(2, "0")}`;
                          const isAvailable = availableSet.has(iso);
                          const isChosen = replacements.has(iso);
                          const isFreed = selected.has(iso);

                          let circleClass = "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors ";
                          if (isFreed) {
                            circleClass += "bg-muted text-muted-foreground/50 line-through";
                          } else if (isChosen) {
                            circleClass += "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-1";
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
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" />선택됨</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />연기 중</span>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setStep("choose")} disabled={isPending}>뒤로</Button>
                <Button onClick={handleConfirmReschedule} disabled={replacements.size === 0 || isPending} className="gap-2">
                  {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  확인
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export function UserDetailView({ detail }: { detail: AdminUserDetail }) {
  const { profile, subscriptionEntries, compensationCredits } = detail;

  const statusColors: Record<string, string> = {
    approved: "bg-green-100 text-green-800",
    pending: "bg-amber-100 text-amber-800",
    disabled: "bg-red-100 text-red-800",
  };

  const pendingCredits = compensationCredits.filter((c) => !c.appliedAt);
  const appliedCredits = compensationCredits.filter((c) => c.appliedAt);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/users"
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">{profile.realName}</h1>
          <p className="text-sm text-muted-foreground">{profile.email}</p>
        </div>
        <Badge
          className={`ml-auto ${statusColors[profile.status] ?? "bg-muted text-muted-foreground"}`}
        >
          {profile.status === "approved"
            ? "승인됨"
            : profile.status === "pending"
              ? "승인 대기"
              : "비활성화"}
        </Badge>
      </div>

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            사용자 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">닉네임</span>
            <span>{profile.nickname || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">역할</span>
            <span className="capitalize">{profile.role}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">가입일</span>
            <span>{new Date(profile.createdAt).toLocaleDateString("ko-KR")}</span>
          </div>
        </CardContent>
      </Card>

      {/* Compensation Credits */}
      {compensationCredits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Gift className="h-4 w-4" />
              보상 크레딧
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pendingCredits.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  미적용
                </p>
                <div className="space-y-2">
                  {pendingCredits.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 dark:bg-green-950/30"
                    >
                      <div>
                        <p className="text-sm font-medium">
                          {c.days}일{" "}
                          <span className="text-xs text-muted-foreground">
                            ({c.reason === "vacation_skip" ? "휴가 스킵" : c.reason ?? "휴무 보상"})
                          </span>
                        </p>
                        {c.sourcePeriod && (
                          <p className="text-xs text-muted-foreground">
                            {c.sourcePeriod}
                          </p>
                        )}
                      </div>
                      <Badge variant="secondary" className="bg-green-100 text-green-700">
                        대기 중
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {appliedCredits.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  적용 완료
                </p>
                <div className="space-y-2">
                  {appliedCredits.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">
                          {c.days}일{" "}
                          <span className="text-xs">
                            ({c.reason === "vacation_skip" ? "휴가 스킵" : c.reason ?? "휴무 보상"})
                          </span>
                        </p>
                        {c.appliedAt && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(c.appliedAt).toLocaleDateString("ko-KR")} 적용
                          </p>
                        )}
                      </div>
                      <Badge variant="outline">완료</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Subscriptions */}
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          구독 내역
        </h2>

        {subscriptionEntries.length === 0 && (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              구독 내역이 없어요.
            </CardContent>
          </Card>
        )}

        {subscriptionEntries.map((entry) => {
          const isPaid = entry.subscription.paymentStatus === "completed";
          const paidDeliveryDays = entry.subscription.totalDeliveryDays ?? 0;
          const carryoverDays = entry.subscription.carryoverDays;
          const totalSalads = (paidDeliveryDays + carryoverDays) * entry.subscription.saladsPerDelivery;
          const paidSalads = paidDeliveryDays * entry.subscription.saladsPerDelivery;

          return (
            <Card key={entry.subscription.id}>
              <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-3">
                <div className="flex-1">
                  <CardTitle className="text-base">
                    {entry.subscription.targetMonth}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    주 {entry.subscription.frequencyPerWeek}회 ·{" "}
                    {entry.subscription.saladsPerDelivery}개/회 ·{" "}
                    총 {totalSalads}개
                    {carryoverDays > 0 && (
                      <span className="ml-1 text-amber-600">
                        (결제 {paidSalads}개 + 보상 {carryoverDays * entry.subscription.saladsPerDelivery}개)
                      </span>
                    )}
                  </p>
                </div>
                {isPaid ? (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  >
                    <Check className="h-3 w-3" />
                    결제 완료
                  </Badge>
                ) : (
                  <Badge
                    variant="secondary"
                    className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    <Clock className="h-3 w-3" />
                    결제 대기
                  </Badge>
                )}
              </CardHeader>

              {entry.deliveryDateStrings.length > 0 && (
                <>
                  <Separator />
                  <CardContent className="pt-4">
                    <AdminSkipPanel
                      userId={profile.id}
                      entry={entry}
                    />
                  </CardContent>
                </>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
