"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  createSubscriptionPeriod,
  updateSubscriptionPeriod,
  deleteSubscriptionPeriod,
  getSubscriptionsByPeriod,
  adminUpdateSubscriptionPayment,
  getSubscriptionSummaryText,
  adminAddSubscription,
} from "@/lib/actions/subscription";
import { getCompanyUsers } from "@/lib/actions/admin";
import { adminGetDeliveryDates, adminUpdateDeliveryDates } from "@/lib/actions/delivery";
import { toast } from "sonner";
import { formatDateISO, cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  CalendarRange,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Users,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Copy,
  MessageSquareText,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DateRangePicker } from "@/components/shared/date-range-picker";
import type {
  SubscriptionPeriod,
  Subscription,
  PaymentMethod,
} from "@/types";

interface PeriodManagementProps {
  initialPeriods: SubscriptionPeriod[];
  holidays: string[];
}

type DateRange = { from: Date | undefined; to: Date | undefined };

type PeriodFormData = {
  target_month: string;
  price_per_salad: number;
  applyRange: DateRange;
  payRange: DateRange;
  deliveryRange: DateRange;
};

const emptyForm: PeriodFormData = {
  target_month: "",
  price_per_salad: 0,
  applyRange: { from: undefined, to: undefined },
  payRange: { from: undefined, to: undefined },
  deliveryRange: { from: undefined, to: undefined },
};

function formatDisplay(isoStr: string) {
  if (!isoStr) return "-";
  return new Date(isoStr).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

function generateDatesFromPreset(
  start: string,
  end: string,
  weekdays: number[],
  holidaySet: Set<string>
): Date[] {
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
      if (!holidaySet.has(`${y}-${m}-${d}`)) {
        dates.push(new Date(cursor));
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function PeriodManagement({ initialPeriods, holidays }: PeriodManagementProps) {
  type SubscriberRow = Subscription & {
    profiles: { nickname: string; email: string; real_name: string };
  };

  const [periods, setPeriods] = useState(initialPeriods);
  const [form, setForm] = useState<PeriodFormData>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedPeriodId, setExpandedPeriodId] = useState<string | null>(null);
  const [subscribers, setSubscribers] = useState<SubscriberRow[]>([]);
  const [loadingSubscribers, setLoadingSubscribers] = useState(false);
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editPaymentMethod, setEditPaymentMethod] =
    useState<PaymentMethod>("credit_card");
  const [summaryTexts, setSummaryTexts] = useState<Record<string, string>>({});
  const [loadingSummary, setLoadingSummary] = useState(false);

  const [addSubDialog, setAddSubDialog] = useState<{ open: boolean; periodId: string }>({ open: false, periodId: "" });
  const [addSubSearch, setAddSubSearch] = useState("");
  const [addSubUsers, setAddSubUsers] = useState<{ id: string; realName: string }[]>([]);
  const [addSubSelectedUser, setAddSubSelectedUser] = useState<{ id: string; realName: string } | null>(null);
  const [addSubFreq, setAddSubFreq] = useState(5);
  const [addSubSalads, setAddSubSalads] = useState(1);
  const [addSubLoading, setAddSubLoading] = useState(false);
  const [addSubDates, setAddSubDates] = useState<Date[]>([]);
  const [addSubPreset, setAddSubPreset] = useState<string | null>(null);
  const [editSubDates, setEditSubDates] = useState<Date[]>([]);
  const [editSubDatesLoading, setEditSubDatesLoading] = useState(false);
  const [savingDates, setSavingDates] = useState(false);

  const adminPaymentMethods: { value: PaymentMethod; label: string }[] = [
    { value: "credit_card", label: "신용카드" },
    { value: "gift_certificate", label: "상품권" },
    { value: "bank_transfer", label: "계좌이체" },
  ];

  async function toggleSubscribers(periodId: string) {
    if (expandedPeriodId === periodId) {
      setExpandedPeriodId(null);
      return;
    }

    setExpandedPeriodId(periodId);
    setLoadingSubscribers(true);
    try {
      const data = await getSubscriptionsByPeriod(periodId);
      setSubscribers(data);
    } catch {
      toast.error("구독자 목록을 불러오지 못했어요");
    } finally {
      setLoadingSubscribers(false);
    }
  }

  async function handleAdminPaymentUpdate(
    subId: string,
    method: PaymentMethod,
    status: "pending" | "completed"
  ) {
    const result = await adminUpdateSubscriptionPayment(subId, method, status);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setSubscribers((prev) =>
      prev.map((s) =>
        s.id === subId
          ? { ...s, payment_method: method, payment_status: status }
          : s
      )
    );
    toast.success(
      status === "completed" ? "결제 완료 처리" : "결제 상태 변경"
    );
  }

  async function openAddSubDialog(periodId: string) {
    setAddSubDialog({ open: true, periodId });
    setAddSubSearch("");
    setAddSubSelectedUser(null);
    setAddSubFreq(5);
    setAddSubSalads(1);
    setAddSubDates([]);
    setAddSubPreset(null);
    const users = await getCompanyUsers();
    setAddSubUsers(users);
  }

  async function handleAddSubscriber() {
    if (!addSubSelectedUser) {
      toast.error("사용자를 선택해주세요");
      return;
    }
    if (addSubDates.length === 0) {
      toast.error("배달 날짜를 선택해주세요");
      return;
    }
    setAddSubLoading(true);
    try {
      const dateStrings = addSubDates
        .map((d) => formatDateISO(d))
        .sort();
      const result = await adminAddSubscription(
        addSubDialog.periodId,
        addSubSelectedUser.id,
        addSubFreq === 0 ? 1 : addSubFreq,
        addSubSalads,
        dateStrings
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${addSubSelectedUser.realName}님이 추가되었습니다`);
      setAddSubDialog({ open: false, periodId: "" });
      if (expandedPeriodId === addSubDialog.periodId) {
        const data = await getSubscriptionsByPeriod(addSubDialog.periodId);
        setSubscribers(data);
      }
    } finally {
      setAddSubLoading(false);
    }
  }

  function openCreateDialog() {
    setForm(emptyForm);
    setEditingId(null);
    setIsOpen(true);
  }

  function openEditDialog(period: SubscriptionPeriod) {
    setForm({
      target_month: period.target_month,
      price_per_salad: period.price_per_salad ?? 0,
      applyRange: {
        from: new Date(period.apply_start),
        to: new Date(period.apply_end),
      },
      payRange: {
        from: new Date(period.pay_start),
        to: new Date(period.pay_end),
      },
      deliveryRange: {
        from: period.delivery_start
          ? new Date(period.delivery_start + "T00:00:00")
          : undefined,
        to: period.delivery_end
          ? new Date(period.delivery_end + "T00:00:00")
          : undefined,
      },
    });
    setEditingId(period.id);
    setIsOpen(true);
  }

  async function handleSave() {
    if (
      !form.target_month ||
      !form.applyRange.from ||
      !form.applyRange.to ||
      !form.payRange.from ||
      !form.payRange.to
    ) {
      toast.error("모든 항목을 입력해주세요");
      return;
    }

    setIsLoading(true);
    try {
      const startOfDay = (d: Date) => {
        const date = new Date(d);
        date.setHours(0, 0, 0, 0);
        return date.toISOString();
      };
      const endOfDay = (d: Date) => {
        const date = new Date(d);
        date.setHours(23, 59, 59, 999);
        return date.toISOString();
      };
      const payload = {
        target_month: form.target_month,
        price_per_salad: form.price_per_salad,
        apply_start: startOfDay(form.applyRange.from),
        apply_end: endOfDay(form.applyRange.to),
        pay_start: startOfDay(form.payRange.from),
        pay_end: endOfDay(form.payRange.to),
        delivery_start: form.deliveryRange.from
          ? formatDateISO(form.deliveryRange.from)
          : null,
        delivery_end: form.deliveryRange.to
          ? formatDateISO(form.deliveryRange.to)
          : null,
      };

      let result;
      if (editingId) {
        result = await updateSubscriptionPeriod(editingId, payload);
      } else {
        result = await createSubscriptionPeriod(payload);
      }

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingId ? "수정 완료" : "생성 완료");
      setIsOpen(false);

      if (editingId) {
        setPeriods((prev) =>
          prev.map((p) =>
            p.id === editingId ? { ...p, ...payload } : p
          )
        );
      } else {
        setPeriods((prev) => [
          {
            id: crypto.randomUUID(),
            ...payload,
            created_at: new Date().toISOString(),
          } as SubscriptionPeriod,
          ...prev,
        ]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDelete(id: string) {
    const result = await deleteSubscriptionPeriod(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("삭제 완료");
    setPeriods((prev) => prev.filter((p) => p.id !== id));
  }

  function getPhase(period: SubscriptionPeriod) {
    const now = new Date();
    if (now < new Date(period.apply_start)) return "upcoming";
    if (now <= new Date(period.apply_end)) return "applying";
    if (now < new Date(period.pay_start)) return "between";
    if (now <= new Date(period.pay_end)) return "paying";
    return "closed";
  }

  const phaseLabel: Record<string, string> = {
    upcoming: "예정",
    applying: "신청 중",
    between: "검토 중",
    paying: "결제 기간",
    closed: "마감",
  };

  const phaseColor: Record<string, string> = {
    upcoming:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    applying:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    between:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    paying:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
    closed:
      "bg-gray-100 text-gray-800 dark:bg-gray-800/50 dark:text-gray-400",
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <CalendarRange className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">
            구독 기간 관리
          </h1>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="mr-1 h-4 w-4" />
          새 기간
        </Button>
      </div>

      {periods.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <CalendarRange className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              아직 구독 기간이 없습니다
            </p>
            <Button size="sm" onClick={openCreateDialog}>
              첫 기간 만들기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {periods.map((period) => {
            const phase = getPhase(period);
            const isExpanded = expandedPeriodId === period.id;
            return (
              <Card key={period.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {period.target_month}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${phaseColor[phase]}`}
                      >
                        {phaseLabel[phase]}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditDialog(period)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(period.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-xs text-muted-foreground">
                        신청 기간
                      </span>
                      <p>
                        {formatDisplay(period.apply_start)} ~{" "}
                        {formatDisplay(period.apply_end)}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground">
                        결제 기간
                      </span>
                      <p>
                        {formatDisplay(period.pay_start)} ~{" "}
                        {formatDisplay(period.pay_end)}
                      </p>
                    </div>
                  </div>
                  {(period.delivery_start || period.price_per_salad > 0) && (
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      {period.delivery_start && period.delivery_end && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            배달 기간
                          </span>
                          <p>
                            {formatDisplay(period.delivery_start)} ~{" "}
                            {formatDisplay(period.delivery_end)}
                          </p>
                        </div>
                      )}
                      {period.price_per_salad > 0 && (
                        <div>
                          <span className="text-xs text-muted-foreground">
                            샐러드 단가
                          </span>
                          <p>{period.price_per_salad.toLocaleString()}원</p>
                        </div>
                      )}
                    </div>
                  )}

                  <Separator />

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between"
                    onClick={() => toggleSubscribers(period.id)}
                  >
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      구독자 목록
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>

                  {isExpanded && (
                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => openAddSubDialog(period.id)}
                      >
                        <Plus className="mr-1.5 h-4 w-4" />
                        구독자 추가
                      </Button>
                      {loadingSubscribers ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : subscribers.length === 0 ? (
                        <p className="py-4 text-center text-sm text-muted-foreground">
                          아직 구독자가 없습니다
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {subscribers.map((sub) => {
                            const isPaid = sub.payment_status === "completed";
                            const isEditingThis = editingSubId === sub.id;
                            const methodLabel =
                              sub.payment_method
                                ? adminPaymentMethods.find(
                                    (m) => m.value === sub.payment_method
                                  )?.label ?? sub.payment_method
                                : "미선택";
                            const totalSalads =
                              (sub.total_delivery_days ?? sub.frequency_per_week * 4) *
                              sub.salads_per_delivery;
                            const totalPrice =
                              period.price_per_salad > 0
                                ? totalSalads * period.price_per_salad
                                : null;

                            return (
                              <div
                                key={sub.id}
                                className="rounded-lg border p-3 space-y-2"
                              >
                                {/* Summary row */}
                                <div className="flex items-center justify-between">
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-sm">
                                      {sub.profiles.nickname}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {sub.profiles.email}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {isPaid ? (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                        <CheckCircle2 className="h-3 w-3" />
                                        완료
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                        <Clock className="h-3 w-3" />
                                        대기
                                      </span>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      onClick={async () => {
                                        if (isEditingThis) {
                                          setEditingSubId(null);
                                        } else {
                                          setEditingSubId(sub.id);
                                          setEditPaymentMethod(
                                            (sub.payment_method as PaymentMethod) ??
                                              "credit_card"
                                          );
                                          setEditSubDatesLoading(true);
                                          try {
                                            const dates = await adminGetDeliveryDates(sub.id);
                                            setEditSubDates(dates.map((d) => new Date(d + "T00:00:00")));
                                          } finally {
                                            setEditSubDatesLoading(false);
                                          }
                                        }
                                      }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Summary details */}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <span>
                                    {sub.frequency_per_week}회/주 ·{" "}
                                    {sub.salads_per_delivery}개
                                  </span>
                                  <span>·</span>
                                  <span>월 {totalSalads}개</span>
                                  {totalPrice !== null && (
                                    <>
                                      <span>·</span>
                                      <span className="font-medium text-foreground">
                                        {totalPrice.toLocaleString()}원
                                      </span>
                                    </>
                                  )}
                                  <span>·</span>
                                  <span>{methodLabel}</span>
                                </div>

                                {/* Edit controls */}
                                {isEditingThis && (
                                  <div className="space-y-3 pt-1">
                                    <div className="space-y-2">
                                      <Label className="text-xs">결제 수단</Label>
                                      <div className="flex items-center gap-1.5">
                                        {adminPaymentMethods.map((method) => (
                                          <button
                                            key={method.value}
                                            onClick={() =>
                                              setEditPaymentMethod(method.value)
                                            }
                                            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                                              editPaymentMethod === method.value
                                                ? "bg-primary/10 text-primary ring-1 ring-primary/30"
                                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                                            }`}
                                          >
                                            {method.label}
                                          </button>
                                        ))}
                                      </div>
                                      <div className="flex gap-2">
                                        {isPaid && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className="flex-1 h-8 text-xs text-destructive"
                                            onClick={async () => {
                                              await handleAdminPaymentUpdate(
                                                sub.id,
                                                editPaymentMethod,
                                                "pending"
                                              );
                                              setEditingSubId(null);
                                            }}
                                          >
                                            결제 취소
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          className="flex-1 h-8 text-xs"
                                          onClick={async () => {
                                            await handleAdminPaymentUpdate(
                                              sub.id,
                                              editPaymentMethod,
                                              "completed"
                                            );
                                            setEditingSubId(null);
                                          }}
                                        >
                                          결제 수정
                                        </Button>
                                      </div>
                                    </div>

                                    <Separator />

                                    <div className="space-y-2">
                                      <Label className="text-xs">
                                        배달 날짜 ({editSubDates.length}일 선택)
                                      </Label>
                                      {editSubDatesLoading ? (
                                        <div className="flex items-center justify-center py-4">
                                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                        </div>
                                      ) : (() => {
                                        if (!period.delivery_start || !period.delivery_end) return null;
                                        const holidaySet = new Set(holidays);
                                        const start = new Date(period.delivery_start + "T00:00:00");
                                        const end = new Date(period.delivery_end + "T00:00:00");

                                        const isSameDay = (a: Date, b: Date) =>
                                          a.getFullYear() === b.getFullYear() &&
                                          a.getMonth() === b.getMonth() &&
                                          a.getDate() === b.getDate();

                                        const toggleDate = (date: Date) => {
                                          const ds = formatDateISO(date);
                                          const dow = date.getDay();
                                          if (dow === 0 || dow === 6 || holidaySet.has(ds)) return;
                                          if (date < start || date > end) return;

                                          setEditSubDates((prev) => {
                                            const exists = prev.some((d) => isSameDay(d, date));
                                            if (exists) return prev.filter((d) => !isSameDay(d, date));
                                            return [...prev, date].sort((a, b) => a.getTime() - b.getTime());
                                          });
                                        };

                                        return (
                                          <>
                                            <Calendar
                                              mode="default"
                                              defaultMonth={start}
                                              disabled={[
                                                { before: start },
                                                { after: end },
                                                { dayOfWeek: [0, 6] },
                                              ]}
                                              modifiers={{
                                                selected: editSubDates,
                                                holiday: holidays.map((h) => new Date(h + "T00:00:00")),
                                              }}
                                              modifiersClassNames={{
                                                selected: "bg-blue-100 text-blue-600 font-medium dark:bg-blue-900/30 dark:text-blue-400",
                                                holiday: "bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400",
                                              }}
                                              classNames={{ root: "w-full" }}
                                              onDayClick={(day) => toggleDate(day)}
                                              className="rounded-md border"
                                            />
                                            <Button
                                              size="sm"
                                              className="w-full h-8 text-xs"
                                              disabled={savingDates}
                                              onClick={async () => {
                                                setSavingDates(true);
                                                try {
                                                  const dateStrings = editSubDates.map((d) => formatDateISO(d)).sort();
                                                  const result = await adminUpdateDeliveryDates(sub.id, sub.user_id, dateStrings);
                                                  if (result.error) {
                                                    toast.error(result.error);
                                                    return;
                                                  }
                                                  setSubscribers((prev) =>
                                                    prev.map((s) =>
                                                      s.id === sub.id
                                                        ? { ...s, total_delivery_days: dateStrings.length || null }
                                                        : s
                                                    )
                                                  );
                                                  toast.success("배달 날짜가 저장되었습니다");
                                                } finally {
                                                  setSavingDates(false);
                                                }
                                              }}
                                            >
                                              {savingDates && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                              날짜 저장 ({editSubDates.length}일)
                                            </Button>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {subscribers.length > 0 && (
                        <div className="pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={loadingSummary}
                            onClick={async () => {
                              setLoadingSummary(true);
                              try {
                                const text = await getSubscriptionSummaryText(period.id);
                                setSummaryTexts((prev) => ({ ...prev, [period.id]: text }));
                              } finally {
                                setLoadingSummary(false);
                              }
                            }}
                          >
                            {loadingSummary ? (
                              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                            ) : (
                              <MessageSquareText className="mr-1.5 h-4 w-4" />
                            )}
                            요약 메시지 생성
                          </Button>

                          {summaryTexts[period.id] && (
                            <div className="mt-3 relative rounded-lg bg-muted/70 p-4">
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="absolute right-2 top-2"
                                onClick={() => {
                                  navigator.clipboard.writeText(summaryTexts[period.id]);
                                  toast.success("클립보드에 복사되었습니다");
                                }}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                              <pre className="whitespace-pre-wrap text-sm leading-relaxed pr-8">
                                {summaryTexts[period.id]}
                              </pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? "기간 수정" : "새 구독 기간"}
            </DialogTitle>
            <DialogDescription>
              대상 월과 신청/결제/배달 기간을 설정하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>대상 월</Label>
                <Input
                  placeholder="예: 2026년 4월"
                  value={form.target_month}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, target_month: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>샐러드 단가 (원)</Label>
                <Input
                  type="number"
                  placeholder="예: 8000"
                  value={form.price_per_salad || ""}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      price_per_salad: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>신청 기간</Label>
              <DateRangePicker
                value={form.applyRange}
                onChange={(range) =>
                  setForm((f) => ({ ...f, applyRange: range }))
                }
                placeholder="신청 시작일 ~ 종료일"
              />
            </div>

            <div className="space-y-2">
              <Label>결제 기간</Label>
              <DateRangePicker
                value={form.payRange}
                onChange={(range) =>
                  setForm((f) => ({ ...f, payRange: range }))
                }
                placeholder="결제 시작일 ~ 종료일"
              />
            </div>

            <div className="space-y-2">
              <Label>배달 기간</Label>
              <DateRangePicker
                value={form.deliveryRange}
                onChange={(range) =>
                  setForm((f) => ({ ...f, deliveryRange: range }))
                }
                placeholder="배달 시작일 ~ 종료일"
              />
              <p className="text-xs text-muted-foreground">
                사용자가 배달 요일을 선택할 수 있는 기간
              </p>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              취소
            </DialogClose>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingId ? "수정" : "생성"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSubDialog.open} onOpenChange={(open) => setAddSubDialog((v) => ({ ...v, open }))}>
        <DialogContent className="max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>구독자 추가</DialogTitle>
            <DialogDescription>
              사용자를 검색하고 구독 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label>사용자</Label>
              {addSubSelectedUser ? (
                <div className="flex items-center justify-between rounded-lg border p-2.5">
                  <span className="text-sm font-medium">{addSubSelectedUser.realName}</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setAddSubSelectedUser(null)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  <Input
                    placeholder="이름으로 검색..."
                    value={addSubSearch}
                    onChange={(e) => setAddSubSearch(e.target.value)}
                  />
                  {addSubSearch.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-md border">
                      {addSubUsers
                        .filter((u) => u.realName.includes(addSubSearch))
                        .map((u) => (
                          <button
                            key={u.id}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                            onClick={() => {
                              setAddSubSelectedUser(u);
                              setAddSubSearch("");
                            }}
                          >
                            {u.realName}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>주 횟수</Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => {
                      setAddSubFreq(n);
                      setAddSubPreset(null);
                      setAddSubDates([]);
                    }}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                      addSubFreq === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {n}회
                  </button>
                ))}
                <button
                  onClick={() => {
                    setAddSubFreq(0);
                    setAddSubPreset(null);
                    setAddSubDates([]);
                  }}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                    addSubFreq === 0
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  자유
                </button>
              </div>

              {(() => {
                const filteredPresets = SCHEDULE_PRESETS.filter((pr) => pr.freq === addSubFreq);
                if (filteredPresets.length === 0) return null;
                const p = periods.find((pp) => pp.id === addSubDialog.periodId);
                if (!p?.delivery_start || !p?.delivery_end) return null;
                const holidaySet = new Set(holidays);

                const applyPreset = (preset: typeof SCHEDULE_PRESETS[0]) => {
                  if (addSubPreset === preset.label) {
                    setAddSubPreset(null);
                    setAddSubDates([]);
                    return;
                  }
                  setAddSubPreset(preset.label);
                  const dates = generateDatesFromPreset(
                    p.delivery_start!,
                    p.delivery_end!,
                    preset.weekdays,
                    holidaySet
                  );
                  setAddSubDates(dates);
                };

                return (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {filteredPresets.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                          addSubPreset === preset.label
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-primary/5 hover:border-primary/30"
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                );
              })()}

              {addSubFreq === 0 && (
                <p className="text-xs text-muted-foreground pt-1">
                  달력에서 원하는 날짜를 자유롭게 선택해주세요
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>샐러드 개수 (1회당)</Label>
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAddSubSalads(n)}
                    className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                      addSubSalads === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {n}개
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const p = periods.find((pp) => pp.id === addSubDialog.periodId);
              if (!p?.delivery_start || !p?.delivery_end) return null;
              const holidaySet = new Set(holidays);
              const start = new Date(p.delivery_start + "T00:00:00");
              const end = new Date(p.delivery_end + "T00:00:00");

              const isSameDay = (a: Date, b: Date) =>
                a.getFullYear() === b.getFullYear() &&
                a.getMonth() === b.getMonth() &&
                a.getDate() === b.getDate();

              const toggleDate = (date: Date) => {
                const ds = formatDateISO(date);
                const dow = date.getDay();
                if (dow === 0 || dow === 6 || holidaySet.has(ds)) return;
                if (date < start || date > end) return;

                setAddSubPreset(null);
                setAddSubDates((prev) => {
                  const exists = prev.some((d) => isSameDay(d, date));
                  if (exists) return prev.filter((d) => !isSameDay(d, date));
                  return [...prev, date].sort((a, b) => a.getTime() - b.getTime());
                });
              };

              return (
                <div className="space-y-2">
                  <Label>배달 날짜 ({addSubDates.length}일 선택)</Label>
                  <Calendar
                    mode="default"
                    defaultMonth={start}
                    disabled={[
                      { before: start },
                      { after: end },
                      { dayOfWeek: [0, 6] },
                    ]}
                    modifiers={{
                      selected: addSubDates,
                      holiday: holidays.map((h) => new Date(h + "T00:00:00")),
                    }}
                    modifiersClassNames={{
                      selected: "bg-blue-100 text-blue-600 font-medium dark:bg-blue-900/30 dark:text-blue-400",
                      holiday: "bg-red-100 text-red-500 dark:bg-red-900/30 dark:text-red-400",
                    }}
                    classNames={{ root: "w-full" }}
                    onDayClick={(day) => toggleDate(day)}
                    className="rounded-md border"
                  />
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
            })()}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              취소
            </DialogClose>
            <Button onClick={handleAddSubscriber} disabled={addSubLoading || !addSubSelectedUser || addSubDates.length === 0}>
              {addSubLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              추가 ({addSubDates.length}일)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
