"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  ChevronDown,
  Salad,
  CalendarCheck,
  Loader2,
  Users,
  X,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  getSubscribersForDate,
  getDateDeliveryDetails,
  type PeriodSubscriber,
  type DateDeliveryDetails,
} from "@/lib/actions/admin";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateCompact } from "@/lib/utils";
import type { SubscriptionPeriod, Holiday } from "@/types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  gift_certificate: "성남사랑",
  bank_transfer: "계좌이체",
  credit_card: "신용카드",
};

function formatPaidAt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  currentPeriod: SubscriptionPeriod | null;
  nextPeriod: SubscriptionPeriod | null;
  currentCounts: Record<string, number>;
  nextCounts: Record<string, number>;
  holidays: Holiday[];
  showBackButton?: boolean;
  showTitle?: boolean;
  isLoggedIn?: boolean;
  defaultMonth?: string;
  /**
   * When true, a collapsible list of all subscribers for the active period
   * is shown above the calendar. Intended for the admin-only page; the
   * underlying server action is itself gated on the `subscription_status`
   * permission so non-admins would get an empty list anyway.
   */
  showSubscriberList?: boolean;
  /**
   * Pre-fetched subscribers for the current/next period. Passing these from
   * the server lets us render the total and paid-complete counts in the
   * section header before the user expands the list.
   */
  currentSubscribers?: PeriodSubscriber[];
  nextSubscribers?: PeriodSubscriber[];
  /**
   * When true, clicking a day tile in the calendar expands an inline detail
   * panel below showing subscribers + menu breakdown (vendor-report style).
   * When false (default), the legacy dialog popup is used — preserving the
   * existing behavior for the home-embedded variant.
   */
  showDateDetailPanel?: boolean;
  /**
   * When true (admin detail-panel mode only), the calendar will auto-open
   * the detail panel for the first date in `counts` that has salads > 0 on
   * mount, unless a `?date=` URL seed is already driving the selection.
   * Gives the admin an immediately useful drill-down on page load.
   */
  autoOpenFirstDataDate?: boolean;
  /**
   * Server-computed default tab index (0 = current period, 1 = next). Used
   * to focus the next-month tab once the current month's payment window
   * has closed, so the admin lands on the actionable period without having
   * to manually switch tabs. URL deep-links (`?date=`) still take priority.
   */
  defaultTabIndex?: number;
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

/**
 * Sync-write a single query param on the current URL WITHOUT re-rendering
 * the page. We use `window.history.replaceState` so the URL stays shareable
 * but clicking a day doesn't trigger a full Next.js navigation or re-fetch
 * of server data. Set `value` to `null` to remove the param.
 */
function syncUrlParam(key: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === null || value === "") {
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
  } else {
    if (url.searchParams.get(key) === value) return;
    url.searchParams.set(key, value);
  }
  window.history.replaceState(null, "", url.toString());
}

/** Strict YYYY-MM-DD shape check — guards against garbage URL input. */
function isValidIsoDate(s: string | null): s is string {
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !Number.isNaN(d.getTime());
}

/** Is `date` inside the period's delivery window? */
function isDateInPeriodRange(
  period: SubscriptionPeriod | null,
  date: string
): boolean {
  if (!period?.delivery_start || !period?.delivery_end) return false;
  const ds = period.delivery_start.slice(0, 10);
  const de = period.delivery_end.slice(0, 10);
  return date >= ds && date <= de;
}

/**
 * Picks which week to show first when a period is loaded (or when the user
 * flips to a different month tab, causing this calendar to remount).
 *
 * Priority:
 *   1. If today is inside the period's delivery window → show today's week
 *      (or next week if today is Sat/Sun). This preserves the "land on
 *      what matters right now" behavior for the active month.
 *   2. Otherwise (period is in the future or already ended) → jump to the
 *      Monday of the earliest date in `counts` that has salads ordered.
 *      This avoids opening on a mostly-out-of-range first week (e.g. May
 *      2026 where delivery_start=May 1 is a Friday holiday but the first
 *      real delivery day is May 4).
 *   3. Fall back to the Monday of the period's delivery_start when no
 *      subscriber data is available yet.
 */
function getInitialMonday(
  period: SubscriptionPeriod | null,
  counts?: Record<string, number>
): Date {
  const now = new Date();
  const dow = now.getDay();
  const isWeekend = dow === 0 || dow === 6;

  if (period?.delivery_start) {
    const deliveryStart = new Date(period.delivery_start + "T00:00:00");
    const periodMonday = getMonday(deliveryStart);
    const currentMonday = getMonday(now);

    const todayStr = fmtISO(now);
    const delStart = period.delivery_start.slice(0, 10);
    const delEnd = period.delivery_end?.slice(0, 10) ?? delStart;
    const todayInPeriod = todayStr >= delStart && todayStr <= delEnd;

    if (todayInPeriod && currentMonday >= periodMonday) {
      return isWeekend
        ? new Date(currentMonday.getTime() + 7 * 86400000)
        : currentMonday;
    }

    if (counts) {
      let firstDateWithCount: string | null = null;
      for (const [dateStr, c] of Object.entries(counts)) {
        if (c > 0 && (!firstDateWithCount || dateStr < firstDateWithCount)) {
          firstDateWithCount = dateStr;
        }
      }
      if (firstDateWithCount) {
        return getMonday(new Date(firstDateWithCount + "T00:00:00"));
      }
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
  showDateDetailPanel = false,
  initialSelectedDate = null,
  autoOpenFirstDataDate = false,
}: {
  period: SubscriptionPeriod;
  counts: Record<string, number>;
  holidays: Holiday[];
  isLoggedIn?: boolean;
  /**
   * When true, we render an inline detail card below the calendar instead
   * of opening a dialog. Used by the admin subscription-status page.
   */
  showDateDetailPanel?: boolean;
  /**
   * If set (admin detail-panel mode only), the calendar will open with
   * `currentMonday` scrolled to that date's week and the detail panel
   * pre-opened. Used to restore state from a `?date=` URL query param.
   */
  initialSelectedDate?: string | null;
  /**
   * When true and no `initialSelectedDate` was provided, the calendar will
   * auto-open the detail panel for the first date in `counts` with salads
   * > 0 on mount. Used so the admin lands on actionable data without
   * needing to click into a day first.
   */
  autoOpenFirstDataDate?: boolean;
}) {
  const router = useRouter();

  // Resolve the initial date to open the detail panel on. Priority:
  //   1. Valid `initialSelectedDate` (from `?date=` URL deep-link).
  //   2. `autoOpenFirstDataDate` && the period contains today ("current
  //      month" case): prefer today if today has a delivery, otherwise the
  //      next upcoming delivery date, otherwise the last data date as a
  //      graceful fallback. This matches the admin's intent to land on
  //      actionable work: "what's next on the schedule?".
  //   3. `autoOpenFirstDataDate` && period is in the future or past:
  //      earliest data date. This is what makes the May tab open on May 4
  //      (the first real delivery day of that month) rather than jumping
  //      to today — which doesn't belong to that period at all.
  //   4. No seed (panel stays closed).
  //
  // We compute this inline (cheap scan) and funnel both `selectedDate` and
  // `currentMonday` state through it so the initial render is consistent.
  const seedSelectedDate: string | null = (() => {
    if (!showDateDetailPanel) return null;
    if (
      initialSelectedDate &&
      isDateInPeriodRange(period, initialSelectedDate)
    ) {
      return initialSelectedDate;
    }
    if (!autoOpenFirstDataDate) return null;

    // Build a sorted list of dates that have at least one salad ordered.
    // Sorting keeps the "earliest / next upcoming" lookups trivial and
    // avoids needing multiple passes.
    const datesWithCounts = Object.entries(counts)
      .filter(([, c]) => c > 0)
      .map(([d]) => d)
      .sort();
    if (datesWithCounts.length === 0) return null;

    const todayIso = fmtISO(new Date());
    if (isDateInPeriodRange(period, todayIso)) {
      if (datesWithCounts.includes(todayIso)) return todayIso;
      const upcoming = datesWithCounts.find((d) => d >= todayIso);
      if (upcoming) return upcoming;
      // Today is past all scheduled deliveries this month — fall back to
      // the most recent data date so the panel still opens on something.
      return datesWithCounts[datesWithCounts.length - 1];
    }

    return datesWithCounts[0];
  })();

  const [currentMonday, setCurrentMonday] = useState(() => {
    if (seedSelectedDate) {
      return getMonday(new Date(seedSelectedDate + "T00:00:00"));
    }
    return getInitialMonday(period, counts);
  });

  // Dialog state (legacy path, used when showDateDetailPanel === false)
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState("");
  const [dialogUsers, setDialogUsers] = useState<
    { userId: string; realName: string; saladsPerDelivery: number }[]
  >([]);
  const [dialogLoading, setDialogLoading] = useState(false);

  // Inline detail-panel state (used when showDateDetailPanel === true).
  // Seed from the resolved seedSelectedDate so a URL deep-link OR the
  // auto-open rule both restore the drill-down without flicker.
  const [selectedDate, setSelectedDate] = useState<string | null>(
    seedSelectedDate
  );
  // Start in the loading state when we have any seed, so the detail card
  // shows a skeleton on first paint instead of briefly flashing the
  // empty-state message before the mount fetch completes.
  const [detailLoading, setDetailLoading] = useState(!!seedSelectedDate);
  const [details, setDetails] = useState<DateDeliveryDetails>({
    subscribers: [],
    menuBreakdown: [],
  });

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

  // Fetch details and reflect the selected date in the URL so the drill-down
  // is shareable / reload-safe. We use `history.replaceState` internally so
  // this doesn't trigger any Next.js navigation or re-render.
  const openDateDetails = useCallback(
    async (dateStr: string) => {
      setSelectedDate(dateStr);
      syncUrlParam("date", dateStr);
      setDetailLoading(true);
      setDetails({ subscribers: [], menuBreakdown: [] });
      try {
        const data = await getDateDeliveryDetails(period.id, dateStr);
        setDetails(data);
      } catch {
        setDetails({ subscribers: [], menuBreakdown: [] });
      } finally {
        setDetailLoading(false);
      }
    },
    [period.id]
  );

  const closeDateDetails = useCallback(() => {
    setSelectedDate(null);
    syncUrlParam("date", null);
  }, []);

  async function handleDateClick(dateStr: string, count: number) {
    if (count === 0) return;
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }

    if (showDateDetailPanel) {
      if (selectedDate === dateStr) {
        closeDateDetails();
        return;
      }
      await openDateDetails(dateStr);
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

  // On mount (only), if a seed date was resolved (either from a `?date=`
  // URL deep-link or from the "auto-open first data day" rule), kick off
  // the fetch. `firstLoadRef` guards against parent prop changes reopening
  // a panel the user has just dismissed — the URL is now owned by this
  // component for the remainder of its lifetime.
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (!firstLoadRef.current) return;
    firstLoadRef.current = false;
    if (seedSelectedDate) {
      void openDateDetails(seedSelectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset inline detail panel whenever the visible week changes so a
  // lingering drill-down for a now-offscreen date doesn't confuse the admin.
  // Skip the very first mount so a URL-seeded selection isn't wiped.
  const skipFirstWeekEffectRef = useRef(true);
  useEffect(() => {
    if (!showDateDetailPanel) return;
    if (skipFirstWeekEffectRef.current) {
      skipFirstWeekEffectRef.current = false;
      return;
    }
    closeDateDetails();
  }, [currentMonday, showDateDetailPanel, closeDateDetails]);

  const todayStr = fmtISO(new Date());

  const totalSubscriptions = useMemo(() => {
    let total = 0;
    for (const c of Object.values(counts)) total += c;
    return total;
  }, [counts]);


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

              const isSelected =
                showDateDetailPanel && selectedDate === dateStr;

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
                        : isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/30"
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
                    <span className="w-full text-center text-[11px] leading-tight line-clamp-2">
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
                      <Salad className="h-4 w-4" />
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

      {showDateDetailPanel && selectedDate && (
        <DateDetailCard
          date={selectedDate}
          loading={detailLoading}
          details={details}
          onClose={closeDateDetails}
        />
      )}

      <Dialog
        open={dialogOpen && !showDateDetailPanel}
        onOpenChange={setDialogOpen}
      >
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
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
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
            {dialogLoading ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <>
                <span>총 {dialogUsers.length}명</span>
                <span>·</span>
                <span>샐러드 총 {dialogUsers.reduce((sum, u) => sum + u.saladsPerDelivery, 0)}개</span>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DateDetailCard({
  date,
  loading,
  details,
  onClose,
}: {
  date: string;
  loading: boolean;
  details: DateDeliveryDetails;
  onClose: () => void;
}) {
  const formatted = new Date(date + "T00:00:00").toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });

  const totalSalads = details.menuBreakdown.reduce(
    (sum, m) => sum + m.count,
    0
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{formatted}</CardTitle>
          {!loading && details.subscribers.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              총 {details.subscribers.length}명 · 샐러드 {totalSalads}개
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="닫기"
        >
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-1.5">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-10" />
              </div>
            ))}
          </div>
        ) : details.subscribers.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            구독자가 없습니다
          </p>
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                신청자 명단
              </h3>
              <ul className="space-y-1">
                {details.subscribers.map((u, idx) => (
                  <li
                    key={u.userId}
                    className="flex items-center gap-3 rounded-lg px-2 py-1.5"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {idx + 1}
                    </span>
                    <span className="flex-1 text-sm font-medium">
                      {u.realName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {u.saladsPerDelivery}개
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {details.menuBreakdown.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  메뉴별 구성
                </h3>
                <ul className="space-y-2">
                  {details.menuBreakdown.map((m, idx) => (
                    <li
                      key={`${m.menuTitle}-${idx}`}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {m.menuTitle}
                        </span>
                        <span className="text-sm font-semibold text-primary">
                          {m.count}개
                        </span>
                      </div>
                      {m.pickers.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {m.pickers
                            .map((p) =>
                              p.count > 1
                                ? `${p.name} ${p.count}개`
                                : p.name
                            )
                            .join(", ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SubscriberListSection({
  period,
  subscribers,
}: {
  period: SubscriptionPeriod;
  subscribers: PeriodSubscriber[];
}) {
  const [open, setOpen] = useState(false);

  // Collapse whenever the active period changes so switching months
  // doesn't leave an unrelated list open.
  useEffect(() => {
    setOpen(false);
  }, [period.id]);

  const totalCount = subscribers.length;
  const paidCount = useMemo(
    () => subscribers.filter((s) => s.paymentStatus === "completed").length,
    [subscribers]
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-t-xl px-6 py-4 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-semibold">구독자 명단</span>
          <span className="truncate text-xs text-muted-foreground">
            총 {totalCount}명 · 결제 완료 {paidCount}명
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <CardContent className="border-t pt-4">
          {subscribers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              구독자가 없습니다
            </p>
          ) : (
            <ul className="space-y-3">
              {subscribers.map((s) => (
                <SubscriberRow key={s.subscriptionId} subscriber={s} />
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function SubscriberRow({ subscriber }: { subscriber: PeriodSubscriber }) {
  const isPaid = subscriber.paymentStatus === "completed";
  const methodLabel = subscriber.paymentMethod
    ? (PAYMENT_METHOD_LABELS[subscriber.paymentMethod] ??
      subscriber.paymentMethod)
    : "미선택";

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{subscriber.realName}</span>
          <Badge
            variant={isPaid ? "default" : "secondary"}
            className="px-1.5 py-0 text-[10px]"
          >
            {isPaid ? "결제 완료" : "미결제"}
          </Badge>
        </div>
        <span className="text-sm font-medium text-primary">
          {subscriber.price.toLocaleString()}원
        </span>
      </div>

      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>결제 수단</span>
        <span className="text-foreground">{methodLabel}</span>

        <span>결제 일시</span>
        <span className="text-foreground">{formatPaidAt(subscriber.paidAt)}</span>

        <span>신청 구성</span>
        <span className="text-foreground">
          {subscriber.frequencyPerWeek > 0
            ? `주 ${subscriber.frequencyPerWeek}회`
            : "자유"}
          {" · "}1회 {subscriber.saladsPerDelivery}개 · 총 {subscriber.totalDeliveryDays}일
        </span>

        <span>선택 날짜</span>
        <span className="text-foreground">
          {subscriber.deliveryDates.length === 0 ? (
            <span className="text-muted-foreground">선택된 날짜 없음</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {subscriber.deliveryDates.map((d) => (
                <span
                  key={d}
                  className="rounded bg-muted px-1.5 py-0.5 font-medium"
                >
                  {formatDateCompact(d)}
                </span>
              ))}
            </span>
          )}
          {subscriber.remainingSlots > 0 && (
            <span className="mt-1 block text-[11px] text-amber-600 dark:text-amber-500">
              아직 {subscriber.remainingSlots}일 더 선택할 수 있어요
            </span>
          )}
        </span>
      </div>
    </li>
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
  defaultMonth,
  showSubscriberList = false,
  currentSubscribers = [],
  nextSubscribers = [],
  showDateDetailPanel = false,
  autoOpenFirstDataDate = false,
  defaultTabIndex = 0,
}: Props) {
  const tabs = useMemo(() => {
    const t: {
      label: string;
      period: SubscriptionPeriod | null;
      counts: Record<string, number>;
      subscribers: PeriodSubscriber[];
    }[] = [];
    if (currentPeriod) {
      t.push({
        label: currentPeriod.target_month,
        period: currentPeriod,
        counts: currentCounts,
        subscribers: currentSubscribers,
      });
    }
    if (nextPeriod) {
      t.push({
        label: nextPeriod.target_month,
        period: nextPeriod,
        counts: nextCounts,
        subscribers: nextSubscribers,
      });
    }
    return t;
  }, [
    currentPeriod,
    nextPeriod,
    currentCounts,
    nextCounts,
    currentSubscribers,
    nextSubscribers,
  ]);

  // Read `?date=YYYY-MM-DD` once on mount. If the date belongs to a specific
  // tab's period, open that tab and forward the date to the calendar so it
  // can jump to the matching week and pre-open the detail panel. After
  // initial consumption we never re-read from the URL — the calendar owns
  // the URL from that point on via `window.history.replaceState`. When the
  // URL doesn't supply a valid date we fall back to `defaultTabIndex`
  // (computed server-side), so the tab focus still reflects "what matters
  // right now" (e.g. next month once this month's payment has closed).
  const searchParams = useSearchParams();
  const clampedDefaultTab =
    tabs.length === 0
      ? 0
      : Math.max(0, Math.min(defaultTabIndex, tabs.length - 1));
  const { initialTab, initialDate } = useMemo(() => {
    if (!showDateDetailPanel || tabs.length === 0) {
      return {
        initialTab: clampedDefaultTab,
        initialDate: null as string | null,
      };
    }
    const raw = searchParams?.get("date") ?? null;
    if (!isValidIsoDate(raw)) {
      return { initialTab: clampedDefaultTab, initialDate: null };
    }
    const idx = tabs.findIndex((t) => isDateInPeriodRange(t.period, raw));
    if (idx < 0) return { initialTab: clampedDefaultTab, initialDate: null };
    return { initialTab: idx, initialDate: raw };
    // searchParams is intentionally excluded — we only want the mount value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, showDateDetailPanel, clampedDefaultTab]);

  const [activeTab, setActiveTab] = useState(initialTab);
  // `initialDate` is a one-shot deep-link seed. Once the user switches
  // tabs (or explicitly closes the drill-down — handled inside the
  // calendar), we zero it out so a subsequent remount doesn't reopen a
  // drill-down the user already moved past.
  const [deepLinkDate, setDeepLinkDate] = useState<string | null>(
    initialDate
  );

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#subscription-status")) return;

    const monthParam = hash.split("month=")[1];
    if (monthParam && tabs.length > 1) {
      const decoded = decodeURIComponent(monthParam);
      const idx = tabs.findIndex((t) => t.label.includes(decoded));
      if (idx >= 0) setActiveTab(idx);
    }

    setTimeout(() => {
      document.getElementById("subscription-status")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }, []);
  const active = tabs[activeTab];

  // When the user manually switches tabs, drop the `?date=` query and
  // discard the deep-link seed so a stale date from the other month
  // doesn't re-trigger the drill-down if they switch back.
  function handleTabSwitch(idx: number) {
    if (idx === activeTab) return;
    if (showDateDetailPanel) {
      syncUrlParam("date", null);
      setDeepLinkDate(null);
    }
    setActiveTab(idx);
  }

  const monthToggle = tabs.length > 1 && (
    <div className="flex gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab, idx) => (
        <button
          key={tab.label}
          onClick={() => handleTabSwitch(idx)}
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
          {showSubscriberList && active?.period && (
            <SubscriberListSection
              key={`subs-${active.period.id}`}
              period={active.period}
              subscribers={active.subscribers}
            />
          )}

          {active?.period && (
            <MonthCalendar
              key={active.label}
              period={active.period}
              counts={active.counts}
              holidays={holidays}
              isLoggedIn={isLoggedIn}
              showDateDetailPanel={showDateDetailPanel}
              initialSelectedDate={
                activeTab === initialTab ? deepLinkDate : null
              }
              autoOpenFirstDataDate={autoOpenFirstDataDate}
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
