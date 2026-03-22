"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  createOrUpdateSubscription,
  updatePaymentAndMarkPaid,
  updatePaymentMethod,
  cancelSubscription,
  getSoloDeliveryDates,
} from "@/lib/actions/subscription";
import { bulkSaveDeliveryDays } from "@/lib/actions/delivery";
import { handleActionError } from "@/lib/handle-action-error";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarRange,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Check,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Salad,
  EllipsisVertical,
} from "lucide-react";
import successAnimationData from "@/assets/animations/success.json";

const Lottie = dynamic(() => import("lottie-react"), { ssr: false });
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import type {
  SubscriptionPeriod,
  Subscription,
  PaymentMethod,
} from "@/types";

interface SubscriptionViewProps {
  period: SubscriptionPeriod | null;
  existingSubscription: Subscription | null;
  holidays: string[];
  savedDeliveryDates?: string[];
  lastPaymentMethod?: string | null;
}

const WEEKS_PER_MONTH = 4;

const SCHEDULE_PRESETS = [
  { label: "매주 월", freq: 1, weekdays: [1] },
  { label: "매주 화", freq: 1, weekdays: [2] },
  { label: "매주 수", freq: 1, weekdays: [3] },
  { label: "매주 목", freq: 1, weekdays: [4] },
  { label: "매주 금", freq: 1, weekdays: [5] },
  { label: "매주 월/수", freq: 2, weekdays: [1, 3] },
  { label: "매주 화/목", freq: 2, weekdays: [2, 4] },
  { label: "매주 수/금", freq: 2, weekdays: [3, 5] },
  { label: "매주 월/목", freq: 2, weekdays: [1, 4] },
  { label: "매주 월/수/금", freq: 3, weekdays: [1, 3, 5] },
  { label: "매주 화/목/금", freq: 3, weekdays: [2, 4, 5] },
  { label: "매주 월/화/목", freq: 3, weekdays: [1, 2, 4] },
  { label: "매주 월/화/목/금", freq: 4, weekdays: [1, 2, 4, 5] },
  { label: "매주 월/수/목/금", freq: 4, weekdays: [1, 3, 4, 5] },
  { label: "매주 월~금", freq: 5, weekdays: [1, 2, 3, 4, 5] },
];

function countWeekdaysInPeriod(
  start: string | null,
  end: string | null,
  weekdays: number[],
  holidays: Set<string>
): number {
  if (!start || !end) return weekdays.length * WEEKS_PER_MONTH;

  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  let count = 0;
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const dow = cursor.getDay();
    if (weekdays.includes(dow)) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      if (!holidays.has(`${y}-${m}-${d}`)) count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return count;
}

function getMinDeliveryDaysForFrequency(
  freq: number,
  start: string | null,
  end: string | null,
  holidays: Set<string>
): number {
  const presets = SCHEDULE_PRESETS.filter((p) => p.freq === freq);
  if (presets.length === 0 || !start || !end) return freq * WEEKS_PER_MONTH;

  let min = Infinity;
  for (const preset of presets) {
    const count = countWeekdaysInPeriod(start, end, preset.weekdays, holidays);
    if (count < min) min = count;
  }
  return min === Infinity ? freq * WEEKS_PER_MONTH : min;
}

function getDeliveryDates(
  start: string | null,
  end: string | null,
  weekdays: number[],
  holidays: Set<string>
): Date[] {
  if (!start || !end) return [];

  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const dates: Date[] = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const dow = cursor.getDay();
    if (weekdays.includes(dow)) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      if (!holidays.has(`${y}-${m}-${d}`)) {
        dates.push(new Date(cursor));
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function getWeekMonday(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function detectMatchingPreset(
  savedDates: Date[],
  frequency: number,
  deliveryStart: string | null,
  deliveryEnd: string | null,
  holidays: Set<string>
): string | null {
  if (savedDates.length === 0 || !deliveryStart || !deliveryEnd) return null;

  const presets = SCHEDULE_PRESETS.filter((p) => p.freq === frequency);
  const savedSet = new Set(
    savedDates.map((d) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })
  );

  for (const preset of presets) {
    const expectedDates = getDeliveryDates(
      deliveryStart,
      deliveryEnd,
      preset.weekdays,
      holidays
    );
    const expectedSet = new Set(
      expectedDates.map((d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      })
    );

    if (
      savedSet.size === expectedSet.size &&
      [...savedSet].every((d) => expectedSet.has(d))
    ) {
      return preset.label;
    }
  }
  return null;
}

function datesToWeeklySelections(
  dates: Date[]
): { weekStart: string; selectedDays: number[] }[] {
  const weekMap = new Map<string, number[]>();
  for (const date of dates) {
    const weekStart = getWeekMonday(date);
    if (!weekMap.has(weekStart)) weekMap.set(weekStart, []);
    const dow = date.getDay();
    if (dow >= 1 && dow <= 5) {
      weekMap.get(weekStart)!.push(dow);
    }
  }
  return [...weekMap.entries()].map(([weekStart, days]) => ({
    weekStart,
    selectedDays: [...new Set(days)].sort((a, b) => a - b),
  }));
}

function DeliveryCalendar({
  selectedDates,
  holidayDates,
  deliveryStart,
  deliveryEnd,
  calendarMonth,
  onToggleDate,
  disabled,
}: {
  selectedDates: Date[];
  holidayDates: Date[];
  deliveryStart: string | null;
  deliveryEnd: string | null;
  calendarMonth: Date;
  onToggleDate: (date: Date) => void;
  disabled?: boolean;
}) {
  const startDate = deliveryStart
    ? new Date(deliveryStart + "T00:00:00")
    : null;
  const endDate = deliveryEnd ? new Date(deliveryEnd + "T00:00:00") : null;

  return (
    <div className="space-y-4">
      <Calendar
        defaultMonth={calendarMonth}
        hideNavigation
        weekStartsOn={1}
        className="w-full p-0"
        classNames={{
          root: "w-full",
          day: "flex-1",
          weekday:
            "flex-1 text-[0.8rem] font-normal text-muted-foreground select-none",
          weekdays: "flex w-full [&>*:nth-child(n+6)]:hidden",
          week: "mt-2 flex w-full",
          today: "",
        }}
        components={{
          Day: ({ day, modifiers, ...tdProps }) => {
            const d = day.date;
            const dow = d.getDay();

            if (dow === 0 || dow === 6) return <td className="hidden" />;

            const isSelected = selectedDates.some((sd) => isSameDay(sd, d));
            const isHoliday = holidayDates.some((hd) => isSameDay(hd, d));
            const inRange =
              startDate && endDate && d >= startDate && d <= endDate;
            const isClickable =
              !disabled && inRange && !isHoliday && !modifiers.outside;

            return (
              <td {...tdProps}>
                <div className="flex items-center justify-center py-0.5">
                  <button
                    type="button"
                    onClick={() => isClickable && onToggleDate(d)}
                    disabled={!isClickable}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-sm transition-colors",
                      isSelected &&
                        "bg-blue-100 text-blue-600 font-medium dark:bg-blue-900/30 dark:text-blue-400",
                      isHoliday &&
                        "bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400",
                      modifiers.outside && "text-muted-foreground/30",
                      modifiers.hidden && "invisible",
                      !isSelected &&
                        !isHoliday &&
                        !modifiers.outside &&
                        isClickable &&
                        "text-foreground hover:bg-muted cursor-pointer",
                      !isClickable &&
                        !isHoliday &&
                        !modifiers.outside &&
                        !isSelected &&
                        "text-muted-foreground/40"
                    )}
                  >
                    {!modifiers.hidden && d.getDate()}
                  </button>
                </div>
              </td>
            );
          },
        }}
      />
      <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full bg-blue-100 dark:bg-blue-900/30" />
          선택한 날짜
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-full bg-red-100 dark:bg-red-900/30" />
          공휴일
        </span>
      </div>
    </div>
  );
}

const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "gift_certificate", label: "성남사랑상품권" },
  { value: "bank_transfer", label: "계좌이체" },
  { value: "credit_card", label: "신용카드" },
];

function getPeriodPhase(period: SubscriptionPeriod) {
  const now = new Date();
  if (now < new Date(period.apply_start)) return "upcoming";
  if (now <= new Date(period.apply_end)) return "applying";
  if (now < new Date(period.pay_start)) return "between";
  if (now <= new Date(period.pay_end)) return "paying";
  return "closed";
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

export function SubscriptionView({
  period,
  existingSubscription,
  holidays,
  savedDeliveryDates = [],
  lastPaymentMethod,
}: SubscriptionViewProps) {
  const t = useTranslations("subscription");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [showSuccess, setShowSuccess] = useState(false);
  const [cancelled, setCancelled] = useState(false);

  if (!period) {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">월간 구독</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <AlertCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-center text-muted-foreground">
              현재 진행 중인 구독 기간이 없어요
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (showSuccess) {
    return <SuccessScreen period={period} onContinue={() => router.push("/")} />;
  }

  if (existingSubscription && !cancelled) {
    return (
      <SubscriptionStatus
        period={period}
        subscription={existingSubscription}
        holidays={holidays}
        savedDeliveryDates={savedDeliveryDates}
        lastPaymentMethod={lastPaymentMethod}
        onCancelled={() => setCancelled(true)}
      />
    );
  }

  return (
    <SubscriptionForm
      period={period}
      holidays={holidays}
      onSuccess={() => setShowSuccess(true)}
    />
  );
}

function SuccessScreen({
  period,
  onContinue,
}: {
  period: SubscriptionPeriod;
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12">
          <div style={{ width: 100, height: 100 }}>
            <Lottie
              animationData={successAnimationData}
              loop={false}
              autoplay
              style={{ width: 100, height: 100 }}
            />
          </div>
          <div className="space-y-2 text-center">
            <h2 className="text-xl font-semibold">구독 신청 완료!</h2>
            <p className="text-sm text-muted-foreground">
              {period.target_month} 구독이 성공적으로 신청되었습니다.
            </p>
            <p className="text-sm text-muted-foreground">
              결제 기간에 결제 방법을 선택하고 결제를 완료해주세요.
            </p>
          </div>
          <Button onClick={onContinue} className="mt-2">
            홈으로 돌아가기
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function SubscriptionForm({
  period,
  holidays,
  onSuccess,
}: {
  period: SubscriptionPeriod;
  holidays: string[];
  onSuccess: () => void;
}) {
  const t = useTranslations("subscription");
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [frequency, setFrequency] = useState<number | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [salads, setSalads] = useState(1);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);

  const phase = getPeriodPhase(period);
  const canEdit = phase === "applying" || phase === "paying";

  const holidaySet = new Set(holidays);
  const holidayDates = holidays.map((d) => new Date(d + "T00:00:00"));
  const calendarMonth = period.delivery_start
    ? new Date(period.delivery_start + "T00:00:00")
    : new Date();

  useEffect(() => {
    if (!selectedPreset) return;
    const preset = SCHEDULE_PRESETS.find((p) => p.label === selectedPreset);
    if (preset) {
      setSelectedDates(
        getDeliveryDates(
          period.delivery_start,
          period.delivery_end,
          preset.weekdays,
          holidaySet
        )
      );
    }
  }, [selectedPreset, period.delivery_start, period.delivery_end]);

  const toggleDate = useCallback(
    (date: Date) => {
      setSelectedDates((prev) => {
        const exists = prev.some((d) => isSameDay(d, date));
        if (exists) {
          return prev.filter((d) => !isSameDay(d, date));
        }

        let next = [...prev];

        // Skip weekly cap enforcement for custom date selection (frequency === 0)
        if (frequency !== null && frequency > 0) {
          const weekKey = getWeekMonday(date);
          const sameWeek = prev
            .filter((d) => getWeekMonday(d) === weekKey)
            .sort((a, b) => a.getTime() - b.getTime());

          if (sameWeek.length >= frequency) {
            next = next.filter((d) => !isSameDay(d, sameWeek[0]));
          }
        }

        next.push(date);
        return next.sort((a, b) => a.getTime() - b.getTime());
      });
      setSelectedPreset(null);
    },
    [frequency]
  );

  const holidaySetForCount = new Set(holidays);
  const deliveryDayCount =
    selectedDates.length > 0
      ? selectedDates.length
      : frequency === 0
        ? 0
        : getMinDeliveryDaysForFrequency(frequency ?? 0, period.delivery_start, period.delivery_end, holidaySetForCount);
  const totalSalads = deliveryDayCount * salads;
  const totalPrice =
    period.price_per_salad > 0 ? totalSalads * period.price_per_salad : null;

  async function handleSubmit() {
    if (frequency === null) return;
    if (frequency === 0 && selectedDates.length === 0) {
      toast.error("날짜를 1개 이상 선택해주세요");
      return;
    }
    setIsLoading(true);
    try {
      const effectiveFrequency = frequency === 0 ? 1 : frequency;
      const result = await createOrUpdateSubscription(
        period.id,
        effectiveFrequency,
        salads,
        selectedDates.length > 0 ? selectedDates.length : undefined
      );

      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(
          result.error === "PERIOD_CLOSED"
            ? "신청 기간이 마감되었습니다"
            : result.error
        );
        return;
      }

      if (result.subscriptionId && selectedDates.length > 0) {
        const syncResult = await bulkSaveDeliveryDays(
          result.subscriptionId,
          datesToWeeklySelections(selectedDates)
        );
        if (syncResult.error) {
          if (handleActionError(syncResult.error, router)) return;
          toast.error("배달일 동기화 실패: " + syncResult.error);
        }
      }

      onSuccess();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      </div>

      <PeriodInfoCard period={period} phase={phase} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">구독 신청</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label>{t("frequency")}</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    if (!canEdit) return;
                    setFrequency(n);
                    setSelectedPreset(null);
                    setShowCalendar(false);
                    setSelectedDates([]);
                  }}
                  disabled={!canEdit}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                    frequency === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  } ${!canEdit ? "opacity-50" : ""}`}
                >
                  주 {n}회
                </button>
              ))}
              <button
                onClick={() => {
                  if (!canEdit) return;
                  setFrequency(0);
                  setSelectedPreset(null);
                  setShowCalendar(true);
                  setSelectedDates([]);
                }}
                disabled={!canEdit}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                  frequency === 0
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                } ${!canEdit ? "opacity-50" : ""}`}
              >
                자유
              </button>
            </div>

            {frequency !== null && frequency > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {SCHEDULE_PRESETS.filter((p) => p.freq === frequency).map(
                  (preset) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        if (!canEdit) return;
                        const toggling = selectedPreset === preset.label;
                        setSelectedPreset(toggling ? null : preset.label);
                        if (!toggling) setShowCalendar(true);
                      }}
                      disabled={!canEdit}
                      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedPreset === preset.label
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30"
                      } ${!canEdit ? "opacity-50" : ""}`}
                    >
                      {preset.label}
                    </button>
                  )
                )}
              </div>
            )}

            {frequency === 0 && (
              <p className="text-xs text-muted-foreground">
                달력에서 원하는 날짜를 자유롭게 선택해주세요
              </p>
            )}

            {frequency !== null && showCalendar && period.delivery_start && (
              <DeliveryCalendar
                key={selectedPreset ?? "manual"}
                selectedDates={selectedDates}
                holidayDates={holidayDates}
                deliveryStart={period.delivery_start}
                deliveryEnd={period.delivery_end}
                calendarMonth={calendarMonth}
                onToggleDate={toggleDate}
                disabled={!canEdit}
              />
            )}
          </div>

          <Separator className="mt-2" />

          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("saladsPerDelivery")}</Label>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setSalads(Math.max(1, salads - 1))}
                disabled={salads <= 1 || !canEdit}
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="w-8 text-center font-medium">{salads}</span>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setSalads(Math.min(5, salads + 1))}
                disabled={salads >= 5 || !canEdit}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Separator />

          <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
            {period.price_per_salad > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">샐러드 단가</span>
                <span className="font-medium">{period.price_per_salad.toLocaleString()}원</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">배달 횟수</span>
              <span className="font-medium">{deliveryDayCount}회</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">월 총 샐러드</span>
              <span className="font-medium">{totalSalads}개</span>
            </div>
            {totalPrice !== null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">예상 금액</span>
                <span className="font-semibold text-primary">
                  {totalPrice.toLocaleString()}원
                </span>
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button
            className="h-12 w-full text-base"
            onClick={handleSubmit}
            disabled={isLoading || !canEdit || frequency === null}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            구독 신청하기
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function SubscriptionStatus({
  period,
  subscription,
  holidays,
  savedDeliveryDates: initialSavedDates = [],
  lastPaymentMethod,
  onCancelled,
}: {
  period: SubscriptionPeriod;
  subscription: Subscription;
  holidays: string[];
  savedDeliveryDates?: string[];
  lastPaymentMethod?: string | null;
  onCancelled?: () => void;
}) {
  const t = useTranslations("subscription");
  const router = useRouter();
  const initialPhase = getPeriodPhase(period);
  const isInPaymentWindow = new Date() >= new Date(period.pay_start) && new Date() <= new Date(period.pay_end);
  const [isLoading, setIsLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [frequency, setFrequency] = useState(subscription.frequency_per_week);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(() => {
    if (!initialSavedDates.length) return null;
    const dates = initialSavedDates.map((s) => new Date(s + "T00:00:00"));
    return detectMatchingPreset(
      dates,
      subscription.frequency_per_week,
      period.delivery_start,
      period.delivery_end,
      new Set(holidays)
    );
  });
  const [salads, setSalads] = useState(subscription.salads_per_delivery);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>(
    subscription.payment_method ??
      (lastPaymentMethod as PaymentMethod) ??
      "gift_certificate"
  );
  const [paymentStatus, setPaymentStatus] = useState(
    subscription.payment_status
  );
  const [currentFrequency, setCurrentFrequency] = useState(
    subscription.frequency_per_week
  );
  const [currentSalads, setCurrentSalads] = useState(
    subscription.salads_per_delivery
  );

  const [savedDates, setSavedDates] = useState<Date[]>(() =>
    initialSavedDates.map((s) => new Date(s + "T00:00:00"))
  );

  const phase = getPeriodPhase(period);
  const holidaySet = new Set(holidays);

  const appliedDeliveryDays =
    subscription.total_delivery_days ??
    (savedDates.length > 0
      ? savedDates.length
      : (() => {
          const preset = SCHEDULE_PRESETS.find(
            (p) => p.freq === currentFrequency
          );
          return preset
            ? countWeekdaysInPeriod(
                period.delivery_start,
                period.delivery_end,
                preset.weekdays,
                holidaySet
              )
            : getMinDeliveryDaysForFrequency(currentFrequency, period.delivery_start, period.delivery_end, holidaySet);
        })());
  const currentDeliveryDays = savedDates.length > 0 ? savedDates.length : appliedDeliveryDays;
  const totalSalads = appliedDeliveryDays * currentSalads;
  const totalPrice =
    period.price_per_salad > 0 ? totalSalads * period.price_per_salad : null;

  const matchedPresetLabel = detectMatchingPreset(
    savedDates,
    currentFrequency,
    period.delivery_start,
    period.delivery_end,
    holidaySet
  );

  const isCustomDates = (() => {
    if (savedDates.length === 0 || matchedPresetLabel) return false;
    const weekGroups = new Map<string, Set<number>>();
    for (const d of savedDates) {
      const wk = getWeekMonday(d);
      const set = weekGroups.get(wk) ?? new Set<number>();
      set.add(d.getDay());
      weekGroups.set(wk, set);
    }
    if (weekGroups.size <= 1) return false;
    const patterns = Array.from(weekGroups.values()).map((s) => [...s].sort().join(","));
    return new Set(patterns).size > 1;
  })();

  const initialSavedDateObjects = initialSavedDates.map((s) => new Date(s + "T00:00:00"));
  const [editSelectedDates, setEditSelectedDates] = useState<Date[]>([]);
  const [editShowCalendar, setEditShowCalendar] = useState(false);

  const holidayDates = holidays.map((d) => new Date(d + "T00:00:00"));
  const calendarMonth = period.delivery_start
    ? new Date(period.delivery_start + "T00:00:00")
    : new Date();

  useEffect(() => {
    if (!selectedPreset) return;
    const preset = SCHEDULE_PRESETS.find((p) => p.label === selectedPreset);
    if (preset) {
      setEditSelectedDates(
        getDeliveryDates(
          period.delivery_start,
          period.delivery_end,
          preset.weekdays,
          holidaySet
        )
      );
    }
  }, [selectedPreset, period.delivery_start, period.delivery_end]);

  function handleStartEditing() {
    setFrequency(isCustomDates ? 0 : currentFrequency);
    setSalads(currentSalads);
    setSelectedPreset(matchedPresetLabel);
    setEditSelectedDates([...savedDates]);
    setEditShowCalendar(savedDates.length > 0 || isCustomDates);
    setIsEditing(true);
  }

  const editToggleDate = useCallback(
    (date: Date) => {
      setEditSelectedDates((prev) => {
        const exists = prev.some((d) => isSameDay(d, date));
        if (exists) {
          return prev.filter((d) => !isSameDay(d, date));
        }

        let next = [...prev];

        if (frequency > 0) {
          const weekKey = getWeekMonday(date);
          const sameWeek = prev
            .filter((d) => getWeekMonday(d) === weekKey)
            .sort((a, b) => a.getTime() - b.getTime());

          if (sameWeek.length >= frequency) {
            next = next.filter((d) => !isSameDay(d, sameWeek[0]));
          }
        }

        next.push(date);
        return next.sort((a, b) => a.getTime() - b.getTime());
      });
      setSelectedPreset(null);
    },
    [frequency]
  );

  const editDeliveryDays =
    editSelectedDates.length > 0
      ? editSelectedDates.length
      : frequency === 0
        ? 0
        : getMinDeliveryDaysForFrequency(frequency, period.delivery_start, period.delivery_end, holidaySet);
  const editTotalSalads = editDeliveryDays * salads;
  const editTotalPrice =
    period.price_per_salad > 0
      ? editTotalSalads * period.price_per_salad
      : null;

  const isPaid = paymentStatus === "completed";
  const canEdit = phase === "applying" || phase === "paying";

  const [soloDates, setSoloDates] = useState<{ date: string; weekday: string }[]>([]);
  useEffect(() => {
    if (phase === "paying" || isInPaymentWindow) {
      getSoloDeliveryDates(period.id).then(setSoloDates);
    }
  }, [period.id, phase, isInPaymentWindow]);

  async function handleSavePlan() {
    if (frequency === 0 && editSelectedDates.length === 0) {
      toast.error("날짜를 1개 이상 선택해주세요");
      return;
    }
    setIsLoading(true);
    try {
      const effectiveFrequency = frequency === 0 ? 1 : frequency;
      const result = await createOrUpdateSubscription(
        period.id,
        effectiveFrequency,
        salads,
        editSelectedDates.length > 0 ? editSelectedDates.length : undefined
      );
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }

      if (result.subscriptionId && editSelectedDates.length > 0) {
        const syncResult = await bulkSaveDeliveryDays(
          result.subscriptionId,
          datesToWeeklySelections(editSelectedDates)
        );
        if (syncResult.error) {
          if (handleActionError(syncResult.error, router)) return;
          toast.error("배달일 동기화 실패: " + syncResult.error);
        }
      }

      const planChanged =
        frequency !== currentFrequency || salads !== currentSalads;
      setCurrentFrequency(frequency);
      setCurrentSalads(salads);
      setSavedDates([...editSelectedDates]);
      setIsEditing(false);

      getSoloDeliveryDates(period.id).then(setSoloDates);

      if (planChanged && isPaid) {
        setPaymentStatus("pending");
        setSelectedPayment("credit_card");
        toast.success("플랜이 변경되어 결제를 다시 진행해주세요");
      } else {
        toast.success("구독 플랜이 변경되었습니다");
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleCancelEdit() {
    setFrequency(currentFrequency);
    setSalads(currentSalads);
    setSelectedPreset(null);
    setEditSelectedDates([...savedDates]);
    setIsEditing(false);
  }

  async function handleMarkPaid() {
    setIsLoading(true);
    try {
      const result = await updatePaymentAndMarkPaid(
        subscription.id,
        selectedPayment
      );
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      setPaymentStatus("completed");
      toast.success("결제 완료 신청이 접수되었습니다");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleChangePaymentMethod(method: PaymentMethod) {
    setSelectedPayment(method);
    if (isPaid) {
      const result = await updatePaymentMethod(subscription.id, method);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("결제 수단이 변경되었습니다");
    }
  }

  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  async function handleCancelSubscription() {
    setIsCancelling(true);
    try {
      const result = await cancelSubscription(subscription.id);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("구독 신청이 취소되었습니다");
      setShowCancelDialog(false);
      onCancelled?.();
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">구독 현황</h1>
        </div>
        {canEdit && !isEditing && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-8 w-8" />
              }
            >
              <EllipsisVertical className="h-5 w-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowCancelDialog(true)}
              >
                신청 취소
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <PeriodInfoCard period={period} phase={phase} hideApplicationPeriod />

      {/* Subscription Summary / Edit */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Salad className="h-4 w-4" />
              내 구독
            </CardTitle>
            <div className="flex items-center gap-2">
              {isPaid && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                  <Check className="h-3 w-3" />
                  결제 완료
                </span>
              )}
              {canEdit && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-sm"
                  onClick={handleStartEditing}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  수정
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isEditing ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <Label>{t("frequency")}</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        setFrequency(n);
                        setSelectedPreset(null);
                        setEditShowCalendar(false);
                        setEditSelectedDates([]);
                      }}
                      className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                        frequency === n
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      }`}
                    >
                      주 {n}회
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setFrequency(0);
                      setSelectedPreset(null);
                      setEditShowCalendar(true);
                      setEditSelectedDates([]);
                    }}
                    className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                      frequency === 0
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    자유
                  </button>
                </div>
                {frequency > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {SCHEDULE_PRESETS.filter(
                      (p) => p.freq === frequency
                    ).map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          const toggling = selectedPreset === preset.label;
                          setSelectedPreset(toggling ? null : preset.label);
                          if (!toggling) setEditShowCalendar(true);
                        }}
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                          selectedPreset === preset.label
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
                {frequency === 0 && (
                  <p className="text-xs text-muted-foreground">
                    달력에서 원하는 날짜를 자유롭게 선택해주세요
                  </p>
                )}

                {editShowCalendar && period.delivery_start && (
                  <DeliveryCalendar
                    key={selectedPreset ?? "manual"}
                    selectedDates={editSelectedDates}
                    holidayDates={holidayDates}
                    deliveryStart={period.delivery_start}
                    deliveryEnd={period.delivery_end}
                    calendarMonth={calendarMonth}
                    onToggleDate={editToggleDate}
                  />
                )}
              </div>

              <Separator className="mt-2" />

              <div className="flex items-center justify-between">
                <Label className="text-sm">{t("saladsPerDelivery")}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setSalads(Math.max(1, salads - 1))}
                    disabled={salads <= 1}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-8 text-center font-medium">{salads}</span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => setSalads(Math.min(5, salads + 1))}
                    disabled={salads >= 5}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
                {period.price_per_salad > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">샐러드 단가</span>
                    <span className="font-medium">{period.price_per_salad.toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">배달 횟수</span>
                  <span className="font-medium">{editDeliveryDays}회</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">월 총 샐러드</span>
                  <span className="font-medium">{editTotalSalads}개</span>
                </div>
                {editTotalPrice !== null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">예상 금액</span>
                    <span className="font-semibold text-primary">
                      {editTotalPrice.toLocaleString()}원
                    </span>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-12 flex-1 text-base"
                  onClick={handleCancelEdit}
                >
                  취소
                </Button>
                <Button
                  className="h-12 flex-1 text-base"
                  onClick={handleSavePlan}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  저장
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("frequency")}</span>
                <span>
                  {isCustomDates ? (
                    "자유 선택"
                  ) : (
                    <>
                      주 {currentFrequency}회
                      {matchedPresetLabel && (
                        <span className="ml-1.5 text-muted-foreground">
                          ({matchedPresetLabel})
                        </span>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t("saladsPerDelivery")}
                </span>
                <span>{currentSalads}개</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">선택한 날짜</span>
                <span>
                  {currentDeliveryDays}/{appliedDeliveryDays}일
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span>월 총 샐러드</span>
                <span>{totalSalads}개</span>
              </div>
              <div className="flex justify-between text-lg font-semibold">
                <span>총 금액</span>
                <span className="text-primary">
                  {(totalSalads * period.price_per_salad).toLocaleString()}원
                </span>
              </div>

              {!canEdit && savedDates.length > 0 && period.delivery_start && (
                <div className="pt-2">
                  <DeliveryCalendar
                    selectedDates={savedDates}
                    holidayDates={holidayDates}
                    deliveryStart={period.delivery_start}
                    deliveryEnd={period.delivery_end}
                    calendarMonth={calendarMonth}
                    onToggleDate={() => {}}
                    disabled
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Solo delivery date warnings */}
      {soloDates.length > 0 && !isEditing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                {soloDates.map((sd) => {
                  const dt = new Date(sd.date + "T00:00:00");
                  return `${dt.getMonth() + 1}월 ${dt.getDate()}일(${sd.weekday})`;
                }).join(", ")}
                은 혼자 신청했어요. 한 분 더 신청해야 배송이 가능해요.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-amber-300 text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-900/30"
                onClick={() => {
                  const monthLabel = encodeURIComponent(period.target_month);
                  router.push(`/#subscription-status?month=${monthLabel}`);
                }}
              >
                구독 현황 보기
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dithered payment button + home button during application period (only if payment hasn't started) */}
      {phase === "applying" && !isEditing && !isInPaymentWindow && (
        <div className="flex gap-2">
          <Link href="/" className="flex-shrink-0">
            <Button variant="outline" className="h-12 text-base">
              홈으로
            </Button>
          </Link>
          <Popover>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground opacity-40"
                />
              }
            >
              결제 완료 신청
            </PopoverTrigger>
            <PopoverContent side="bottom" className="w-auto px-4 py-3 text-sm">
              {formatDate(period.pay_start)}부터 신청할 수 있어요!
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Payment Section — during payment period, overlapping apply+pay period, or if already paid */}
      {(phase === "paying" || isPaid || isInPaymentWindow) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">결제</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canEdit ? (
              <div className="space-y-2">
                {paymentMethods.map((method) => (
                  <div key={method.value}>
                    <button
                      onClick={() => handleChangePaymentMethod(method.value)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${
                        selectedPayment === method.value
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <CreditCard
                        className={`h-4 w-4 ${
                          selectedPayment === method.value
                            ? "text-primary"
                            : "text-muted-foreground"
                        }`}
                      />
                      <span>{method.label}</span>
                      {selectedPayment === method.value && (
                        <Check className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </button>

                    {selectedPayment === method.value && (
                      <div className="mt-2 rounded-lg bg-muted/50 p-4 text-sm space-y-2">
                        {method.value === "gift_certificate" && (
                          <>
                            <p>1. Chak 앱을 켜주세요.</p>
                            <p>2. QR 결제를 선택하고 아래 QR을 스캔해주세요.</p>
                            <p>3. 금액을 입력하고 결제를 진행해주세요.</p>
                            <p>4. 결제가 완료되면 [결제 완료 신청] 버튼을 눌러주세요.</p>
                            <div className="flex justify-center pt-2">
                              <Image
                                src="/images/qr-payment.png"
                                alt="결제 QR 코드"
                                width={200}
                                height={200}
                                className="rounded-lg"
                              />
                            </div>
                          </>
                        )}
                        {method.value === "bank_transfer" && (
                          <p>
                            국민은행, <span className="font-medium">9921-128-0262</span>(이충근)으로 이체해주세요.
                          </p>
                        )}
                        {method.value === "credit_card" && (
                          <>
                            <p>1. 카카오톡에서 &apos;샐라피&apos;를 추가해주세요.</p>
                            <p>2. 지멘스 헬시니어스 소속이라 말씀해주세요.</p>
                            <p>3. 카드번호, 유효기간, 결제금액을 채팅으로 보내주세요.</p>
                            <p>4. 결제가 완료되면 [결제 완료 신청] 버튼을 눌러주세요.</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <CreditCard className="h-4 w-4 text-muted-foreground" />
                <span>
                  {paymentMethods.find((m) => m.value === selectedPayment)?.label ?? selectedPayment}
                </span>
              </div>
            )}

            {isPaid ? (
              <div className="flex items-center gap-2 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4" />
                <span>결제가 완료되었습니다</span>
              </div>
            ) : soloDates.length > 0 ? (
                <Popover>
                  <PopoverTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-md bg-primary px-4 text-base font-medium text-primary-foreground opacity-40"
                      />
                    }
                  >
                    결제 완료 신청
                  </PopoverTrigger>
                  <PopoverContent side="bottom" className="w-auto px-4 py-3 text-sm">
                    {soloDates.map((sd) => {
                      const dt = new Date(sd.date + "T00:00:00");
                      return `${dt.getMonth() + 1}월 ${dt.getDate()}일(${sd.weekday})`;
                    }).join(", ")}{" "}
                    날짜 조정이 필요해요.
                  </PopoverContent>
                </Popover>
              ) : (
                <Button
                  className="h-12 w-full text-base"
                  onClick={() => {
                    if (confirm("결제를 완료하셨으면 [확인]을 눌러주세요.")) {
                      handleMarkPaid();
                    }
                  }}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  결제 완료 신청
                </Button>
            )}
          </CardContent>
        </Card>
      )}

      {isPaid && (
        <Link href="/my" className="block">
          <Button variant="outline" className="h-12 w-full text-base">
            마이페이지로 이동
          </Button>
        </Link>
      )}

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>구독 신청 취소</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            구독 신청을 취소하시겠어요? 기간 내 다시 신청 가능해요.
          </p>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowCancelDialog(false)}
              disabled={isCancelling}
            >
              아니요
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleCancelSubscription}
              disabled={isCancelling}
            >
              {isCancelling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              취소하기
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PeriodInfoCard({
  period,
  phase,
  hideApplicationPeriod,
}: {
  period: SubscriptionPeriod;
  phase: string;
  hideApplicationPeriod?: boolean;
}) {
  const t = useTranslations("subscription");

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4" />
            {period.target_month}
          </CardTitle>
          <PhaseBadge phase={phase} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {period.delivery_start && period.delivery_end && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">배달 기간</span>
            <span>
              {formatDate(period.delivery_start)} ~{" "}
              {formatDate(period.delivery_end)}
            </span>
          </div>
        )}
        {!hideApplicationPeriod && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t("applicationPeriod")}
            </span>
            <span>
              {formatDate(period.apply_start)} ~ {formatDate(period.apply_end)}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("paymentPeriod")}</span>
          <span>
            {formatDate(period.pay_start)} ~ {formatDate(period.pay_end)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PhaseBadge({ phase }: { phase: string }) {
  const config: Record<string, { label: string; className: string }> = {
    upcoming: {
      label: "예정",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    },
    applying: {
      label: "신청 중",
      className:
        "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    },
    between: {
      label: "검토 중",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    },
    paying: {
      label: "결제 기간",
      className:
        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    },
    closed: {
      label: "마감",
      className:
        "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
    },
  };

  const c = config[phase] ?? config.closed;

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${c.className}`}
    >
      {c.label}
    </span>
  );
}
