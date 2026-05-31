"use client";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  UtensilsCrossed,
  Heart,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  CalendarDays,
  Minus,
  Plus,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDateShort, isSelectionClosed } from "@/lib/utils";
import {
  getWeekdaysBetween,
  getWeekNumber,
  addDaysISO,
} from "@/lib/menu-week-utils";
import type { DailyMenu, MenuSelection, DietaryPreference } from "@/types";
import {
  getDailyMenus,
  getMyMenuSelectionsSummary,
  updateMenuQuantity,
  toggleFavorite,
  getMyFavoriteIds,
} from "@/lib/actions/menu";
import { handleActionError } from "@/lib/handle-action-error";
import { Skeleton } from "@/components/ui/skeleton";
import { useMenuWeekHydration } from "./menu-week-hydration";

const DIETARY_LABELS: Record<string, string> = {
  vegan: "비건",
  gluten_free: "글루텐프리",
  nut_free: "견과류 없음",
  dairy_free: "유제품 없음",
  low_carb: "저탄수화물",
  high_protein: "고단백",
};

interface MenuSelectionViewProps {
  deliveryStart: string | null;
  deliveryEnd: string | null;
  myDeliveryDates?: string[];
  todayStr?: string;
  cutoffDay?: number;
  cutoffTime?: string;
  saladsPerDelivery?: number;
  initialMenus?: DailyMenu[];
  initialSelections?: MenuSelection[];
  initialWeekStart?: string;
  initialWeekEnd?: string;
  initialWeekMonday?: string;
  /** When set (e.g. from /menu?date=YYYY-MM-DD), open that delivery date's week. */
  initialFocusDate?: string;
  blockedDates?: string[];
  deadlineOverrides?: Record<string, string>;
  /** Week menu rows are streaming in from the server (shell renders first). */
  weekDataPending?: boolean;
}

// Collapsible per-day side-menu section (collapsed by default)
function PerDaySideSection({
  menus,
  dateStr,
  dayTotal,
  closed,
  isBrowseOnly,
  allSame,
  renderStepper,
  onMenuClick,
}: {
  menus: DailyMenu[];
  dateStr: string;
  dayTotal: number;
  closed: boolean;
  isBrowseOnly: boolean;
  allSame: boolean;
  renderStepper: (dm: DailyMenu, dateStr: string, dayTotal: number, closed: boolean) => React.ReactNode;
  onMenuClick: (menuId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 overflow-hidden rounded-lg border border-dashed">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/40"
      >
        <span className="inline-flex items-center gap-1.5">
          <span>밥/샌드위치</span>
          <span className="text-xs font-normal text-muted-foreground">{menus.length}종</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="border-t px-3 pb-3 pt-2 space-y-2">
          {menus.map((dm) => {
            const menu = dm.menu!;
            const qty = (dm as any)._qty ?? 0;
            return (
              <div
                key={dm.id}
                role="link"
                tabIndex={0}
                onClick={() => onMenuClick(menu.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onMenuClick(menu.id);
                  }
                }}
                className="flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors hover:bg-accent/50"
              >
                <div className="flex-shrink-0">
                  {menu.image_url ? (
                    <img src={menu.image_url} alt={menu.title} className="h-14 w-14 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                      <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{menu.title}</p>
                  {menu.sauce && (
                    <p className="truncate text-xs text-muted-foreground">{menu.sauce}</p>
                  )}
                  {(menu.protein != null || menu.kcal != null) && (
                    <p className="text-xs text-muted-foreground">
                      {menu.protein != null && `${menu.protein}g`}
                      {menu.protein != null && menu.kcal != null && " · "}
                      {menu.kcal != null && `${menu.kcal}kcal`}
                    </p>
                  )}
                </div>
                {!isBrowseOnly && !closed && (
                  <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    {renderStepper(dm, dateStr, dayTotal, closed)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MenuSelectionView({
  deliveryStart,
  deliveryEnd,
  myDeliveryDates,
  todayStr,
  cutoffDay = 4,
  cutoffTime = "23:59",
  saladsPerDelivery = 1,
  initialMenus,
  initialSelections,
  initialWeekStart,
  initialWeekEnd,
  initialWeekMonday,
  initialFocusDate,
  blockedDates = [],
  deadlineOverrides = {},
  weekDataPending = false,
}: MenuSelectionViewProps) {
  const hasInitialData = !!initialMenus && !weekDataPending;
  const [dailyMenus, setDailyMenus] = useState<DailyMenu[]>(initialMenus ?? []);
  const [selections, setSelections] = useState<MenuSelection[]>(initialSelections ?? []);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(!hasInitialData && !weekDataPending);
  const [updatingMenuId, setUpdatingMenuId] = useState<string | null>(null);

  // Track which week-Monday keys we've already fetched so we never refetch and
  // can show a per-week skeleton when a week hasn't loaded yet.
  const loadedWeeksRef = useRef<Set<string>>(
    new Set(initialWeekStart && !weekDataPending ? [initialWeekStart] : [])
  );
  const inFlightWeeksRef = useRef<Set<string>>(new Set());
  const [weekLoading, setWeekLoading] = useState<string | null>(
    weekDataPending && initialWeekMonday ? initialWeekMonday : null
  );

  const hydration = useMenuWeekHydration();

  const mergeWeekData = useCallback(
    (menuData: DailyMenu[], selData: MenuSelection[], weekMonday: string) => {
      setDailyMenus((prev) => {
        const existingIds = new Set(prev.map((dm) => dm.id));
        const merged = [...prev];
        for (const dm of menuData) {
          if (!existingIds.has(dm.id)) merged.push(dm);
        }
        return merged;
      });
      setSelections((prev) => {
        const key = (s: MenuSelection) =>
          `${s.user_id}|${s.delivery_date}|${s.daily_menu_id}`;
        const existing = new Set(prev.map(key));
        const merged = [...prev];
        for (const s of selData) {
          if (!existing.has(key(s))) merged.push(s);
        }
        return merged;
      });
      loadedWeeksRef.current.add(weekMonday);
      setWeekLoading((cur) => (cur === weekMonday ? null : cur));
    },
    []
  );

  useEffect(() => {
    if (!hydration) return;
    return hydration.registerHydrate(mergeWeekData);
  }, [hydration, mergeWeekData]);

  const router = useRouter();
  const allWeekdays = useMemo(
    () =>
      deliveryStart && deliveryEnd
        ? getWeekdaysBetween(deliveryStart, deliveryEnd)
        : [],
    [deliveryStart, deliveryEnd]
  );
  const blockedDateSet = useMemo(() => new Set(blockedDates), [blockedDates]);
  const selectableWeekdays = useMemo(
    () => allWeekdays.filter((d) => !blockedDateSet.has(d)),
    [allWeekdays, blockedDateSet]
  );

  const deliveryDateSet = useMemo(
    () =>
      myDeliveryDates && myDeliveryDates.length > 0
        ? new Set(myDeliveryDates)
        : null,
    [myDeliveryDates]
  );

  const filteredWeekdays = useMemo(
    () =>
      deliveryDateSet
        ? selectableWeekdays.filter((d) => deliveryDateSet.has(d))
        : [],
    [deliveryDateSet, selectableWeekdays]
  );

  const isBrowseOnly = !deliveryDateSet || filteredWeekdays.length === 0;
  const weekdays = useMemo(
    () => (isBrowseOnly ? selectableWeekdays : filteredWeekdays),
    [filteredWeekdays, isBrowseOnly, selectableWeekdays]
  );

  const weeks = useMemo(
    () =>
      weekdays.reduce<Record<string, string[]>>((acc, date) => {
        const week = getWeekNumber(date);
        if (!acc[week]) acc[week] = [];
        acc[week].push(date);
        return acc;
      }, {}),
    [weekdays]
  );

  const weekKeys = useMemo(() => Object.keys(weeks).sort(), [weeks]);

  const [currentWeekIdx, setCurrentWeekIdx] = useState(0);
  const chipStripRef = useRef<HTMLDivElement>(null);
  // Track drag vs click: only setPointerCapture after movement >5px so child button clicks still fire.
  const chipDragRef = useRef({ dragging: false, startX: 0, scrollLeft: 0, wasDrag: false, pointerId: 0 });
  const currentWeekKey = weekKeys[currentWeekIdx] ?? "";
  const currentWeekDates = weeks[currentWeekKey] ?? [];

  const loadData = useCallback(async () => {
    if (!deliveryStart || !deliveryEnd) return;

    setLoading(true);
    try {
      const [menuData, selData] = await Promise.all([
        getDailyMenus(deliveryStart, deliveryEnd),
        getMyMenuSelectionsSummary(deliveryStart, deliveryEnd),
      ]);
      setDailyMenus(menuData);
      setSelections(selData);
      // Whole-range load: mark every week we know about as loaded.
      for (const wk of Object.keys(weeks)) {
        loadedWeeksRef.current.add(wk);
      }
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryStart, deliveryEnd]);

  // Favorites are non-blocking for first paint — load after mount.
  useEffect(() => {
    void getMyFavoriteIds().then((ids) => setFavoriteIds(new Set(ids)));
  }, []);

  useEffect(() => {
    if (!hasInitialData) loadData();
  }, [loadData, hasInitialData]);

  // Lazy-load a single week's menus + selections on demand. Safe to call
  // redundantly: in-flight requests and already-loaded weeks are deduped.
  const loadWeek = useCallback(
    async (weekMonday: string, opts: { showSkeleton?: boolean } = {}) => {
      if (!weekMonday) return;
      if (loadedWeeksRef.current.has(weekMonday)) return;
      if (inFlightWeeksRef.current.has(weekMonday)) return;

      const weekEnd = addDaysISO(weekMonday, 4);

      inFlightWeeksRef.current.add(weekMonday);
      if (opts.showSkeleton) setWeekLoading(weekMonday);
      try {
        const [menuData, selData] = await Promise.all([
          getDailyMenus(weekMonday, weekEnd),
          getMyMenuSelectionsSummary(weekMonday, weekEnd),
        ]);
        setDailyMenus((prev) => {
          const existingIds = new Set(prev.map((dm) => dm.id));
          const merged = [...prev];
          for (const dm of menuData) {
            if (!existingIds.has(dm.id)) merged.push(dm);
          }
          return merged;
        });
        setSelections((prev) => {
          const key = (s: MenuSelection) =>
            `${s.user_id}|${s.delivery_date}|${s.daily_menu_id}`;
          const existing = new Set(prev.map(key));
          const merged = [...prev];
          for (const s of selData) {
            if (!existing.has(key(s))) merged.push(s);
          }
          return merged;
        });
        loadedWeeksRef.current.add(weekMonday);
      } finally {
        inFlightWeeksRef.current.delete(weekMonday);
        setWeekLoading((cur) => (cur === weekMonday ? null : cur));
      }
    },
    []
  );

  useEffect(() => {
    if (weekKeys.length === 0) return;

    if (initialFocusDate) {
      const focusWeek = getWeekNumber(initialFocusDate);
      const idx = weekKeys.indexOf(focusWeek);
      if (idx >= 0) {
        setCurrentWeekIdx(idx);
        return;
      }
    }

    const today = new Date();
    const todayStrLocal = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const nextDate = weekdays.find((d) => d >= todayStrLocal);
    if (nextDate) {
      const nextWeek = getWeekNumber(nextDate);
      const idx = weekKeys.indexOf(nextWeek);
      if (idx >= 0) {
        setCurrentWeekIdx(idx);
        return;
      }
    }

    const todayWeek = getWeekNumber(todayStrLocal);
    const idx = weekKeys.indexOf(todayWeek);
    if (idx >= 0) {
      setCurrentWeekIdx(idx);
    } else {
      setCurrentWeekIdx(weekKeys.length - 1);
    }
  }, [weekKeys, weekdays, initialFocusDate]);

  // When the user navigates to a week, make sure its data is fetched. Neighbor
  // weeks prefetch after idle so initial load stays fast. Skip refetch while the
  // initial week is still streaming from the server.
  useEffect(() => {
    if (!currentWeekKey) return;

    const initialWeekStillStreaming =
      weekDataPending &&
      initialWeekMonday &&
      currentWeekKey === initialWeekMonday &&
      !loadedWeeksRef.current.has(initialWeekMonday);

    if (!initialWeekStillStreaming) {
      void loadWeek(currentWeekKey, { showSkeleton: true });
    }

    const prefetchNeighbors = () => {
      const prev = weekKeys[currentWeekIdx - 1];
      const next = weekKeys[currentWeekIdx + 1];
      if (prev) void loadWeek(prev);
      if (next) void loadWeek(next);
    };

    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(prefetchNeighbors, { timeout: 2000 });
      return () => cancelIdleCallback(idleId);
    }

    const timerId = setTimeout(prefetchNeighbors, 1500);
    return () => clearTimeout(timerId);
  }, [currentWeekKey, currentWeekIdx, weekKeys, loadWeek, weekDataPending, initialWeekMonday]);

  function getMenusForDate(dateStr: string): DailyMenu[] {
    return dailyMenus.filter((dm) => dm.delivery_date === dateStr);
  }

  function getSelectionsForDate(dateStr: string): MenuSelection[] {
    return selections.filter((s) => s.delivery_date === dateStr);
  }

  function isDateSelectionClosed(dateStr: string): boolean {
    const week = getWeekNumber(dateStr);
    const override = deadlineOverrides[week];
    if (override) return new Date() >= new Date(override);
    return isSelectionClosed(dateStr, cutoffDay, cutoffTime);
  }

  function getQuantityForMenu(dateStr: string, dailyMenuId: string): number {
    const sel = selections.find(
      (s) => s.delivery_date === dateStr && s.daily_menu_id === dailyMenuId
    );
    return sel?.quantity ?? 0;
  }

  function getDayTotal(dateStr: string): number {
    return getSelectionsForDate(dateStr).reduce(
      (sum, s) => sum + (s.quantity ?? 1),
      0
    );
  }

  async function handleQuantityChange(
    dailyMenuId: string,
    dateStr: string,
    newQuantity: number
  ) {
    const replaceForDate = saladsPerDelivery <= 1 && newQuantity > 0;
    setUpdatingMenuId(dailyMenuId);
    try {
      const result = await updateMenuQuantity(dailyMenuId, dateStr, newQuantity, replaceForDate);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }

      setSelections((prev) => {
        let filtered = prev.filter(
          (s) =>
            !(s.delivery_date === dateStr && s.daily_menu_id === dailyMenuId)
        );
        if (replaceForDate) {
          filtered = filtered.filter((s) => s.delivery_date !== dateStr);
        }
        if (newQuantity <= 0) return filtered;
        const matchingMenu = dailyMenus.find((dm) => dm.id === dailyMenuId);
        return [
          ...filtered,
          {
            id: `temp-${Date.now()}`,
            user_id: "",
            daily_menu_id: dailyMenuId,
            delivery_date: dateStr,
            quantity: newQuantity,
            daily_menu_assignment: matchingMenu ?? null,
            created_at: new Date().toISOString(),
          } as MenuSelection,
        ];
      });
    } finally {
      setUpdatingMenuId(null);
    }
  }

  async function handleToggleFavorite(menuId: string) {
    const result = await toggleFavorite(menuId);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (result.favorited) next.add(menuId);
      else next.delete(menuId);
      return next;
    });
  }

  if (!deliveryStart || !deliveryEnd) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">메뉴 선택</h1>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <CalendarDays className="mb-2 h-8 w-8" />
            <p className="text-sm">현재 배달 기간이 없습니다</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent className="space-y-3">
              {[1, 2].map((j) => (
                <div key={j} className="flex gap-3 rounded-lg border p-2.5">
                  <Skeleton className="h-24 w-24 rounded-lg" />
                  <div className="flex-1 space-y-2 py-1">
                    <Skeleton className="h-5 w-6" />
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <div className="flex items-center">
                    <Skeleton className="h-8 w-16 rounded-md" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Include open dates + closed dates that already have a selection (counts as done).
  // Closed dates with no selection are excluded — user can't act on them.
  const relevantDates = weekdays.filter((d) => !isDateSelectionClosed(d) || getDayTotal(d) > 0);
  const selectedCount = relevantDates.filter((d) => getDayTotal(d) > 0).length;
  const totalOpenDates = relevantDates.length;

  // Detect repeated optional (side) menus: if every delivery day has the same
  // set of optional menus, surface them in a shared section rather than repeating per day.
  const optionalMenuIdsByDay = weekdays.map((d) =>
    getMenusForDate(d)
      .filter((dm) => dm.slot_type === "optional" && dm.menu)
      .map((dm) => dm.menu!.id)
      .sort()
      .join(",")
  );
  const allSameOptionals =
    weekdays.length > 0 &&
    optionalMenuIdsByDay.every((sig) => sig === optionalMenuIdsByDay[0] && sig !== "");


  // Stepper helper shared across main and side-menu rows
  function renderStepper(
    dm: DailyMenu,
    dateStr: string,
    dayTotal: number,
    closed: boolean
  ) {
    const qty = getQuantityForMenu(dateStr, dm.id);
    const isUpdating = updatingMenuId === dm.id;
    const canIncrease = dayTotal < saladsPerDelivery && !closed;
    const canDecrease = qty > 0 && !closed;

    if (isUpdating) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;

    if (saladsPerDelivery <= 1) {
      return qty > 0 ? (
        <Button
          size="sm"
          className="h-8 gap-1 bg-green-600 text-xs text-white hover:bg-green-700"
          onClick={(e) => { e.stopPropagation(); handleQuantityChange(dm.id, dateStr, 0); }}
        >
          <Check className="h-3 w-3" />
          선택됨
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={(e) => { e.stopPropagation(); handleQuantityChange(dm.id, dateStr, 1); }}
        >
          {dayTotal > 0 ? "변경" : "선택"}
        </Button>
      );
    }

    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          disabled={!canDecrease}
          onClick={() => handleQuantityChange(dm.id, dateStr, qty - 1)}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <span className="w-5 text-center text-sm font-semibold">{qty}</span>
        <Button
          size="icon"
          variant="outline"
          className="h-7 w-7"
          disabled={!canIncrease}
          onClick={() => handleQuantityChange(dm.id, dateStr, qty + 1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

  return (
    <div className="mx-auto max-w-2xl">
      {/* ── Step 1: Sticky progress header ─────────────────────────── */}
      {!isBrowseOnly && (
        <div className="sticky top-16 z-10 -mx-4 -mt-6 border-b bg-background/95 px-4 pb-3 pt-3 backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              날짜마다 샐러드 {saladsPerDelivery}개를 골라주세요
            </p>
            <span className="text-sm font-semibold">
              {selectedCount}/{totalOpenDates} 완료
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-green-500 transition-all duration-300"
              style={{
                width:
                  totalOpenDates > 0
                    ? `${(selectedCount / totalOpenDates) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>
      )}

      {/* Page title (browse-only mode) */}
      {isBrowseOnly && (
        <h1 className="mb-1 mt-2 text-2xl font-bold tracking-tight">이달의 메뉴</h1>
      )}

      {/* ── Step 2: Date chip strip ─────────────────────────────────── */}
      <div
        ref={chipStripRef}
        className={`-mx-4 cursor-grab overflow-x-auto active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${isBrowseOnly ? "pt-1" : "pt-4"}`}
        onPointerDown={(e) => {
          const el = chipStripRef.current;
          if (!el) return;
          chipDragRef.current = { dragging: true, startX: e.clientX, scrollLeft: el.scrollLeft, wasDrag: false, pointerId: e.pointerId };
          // Do NOT capture yet — capture only after movement threshold so child clicks still fire.
        }}
        onPointerMove={(e) => {
          if (!chipDragRef.current.dragging) return;
          const el = chipStripRef.current;
          if (!el) return;
          const dx = e.clientX - chipDragRef.current.startX;
          if (Math.abs(dx) > 5) {
            if (!chipDragRef.current.wasDrag) {
              // Threshold exceeded — now capture to keep tracking outside the element.
              el.setPointerCapture(chipDragRef.current.pointerId);
            }
            chipDragRef.current.wasDrag = true;
            el.scrollLeft = chipDragRef.current.scrollLeft - dx;
          }
        }}
        onPointerUp={() => { chipDragRef.current.dragging = false; }}
        onPointerCancel={() => { chipDragRef.current.dragging = false; }}
      >
      <div className="flex min-w-max gap-2 px-4 pb-2">
        {weekKeys.map((wk, wkIdx) => (
          <div key={wk} className="flex shrink-0 gap-1.5">
            {/* Week separator label */}
            {wkIdx > 0 && (
              <div className="self-center text-muted-foreground/40 text-xs">|</div>
            )}
            {weeks[wk]?.map((dateStr) => {
              const dt = new Date(dateStr + "T00:00:00");
              const dayLabel = WEEKDAY_LABELS[dt.getDay()];
              const mmdd = `${dt.getMonth() + 1}/${dt.getDate()}`;
              const isActive = currentWeekKey === wk;
              const dayTotal = getDayTotal(dateStr);
              const complete = !isBrowseOnly && dayTotal >= saladsPerDelivery;
              const partial = !isBrowseOnly && dayTotal > 0 && !complete;
              const closed = isDateSelectionClosed(dateStr);
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => {
                    if (chipDragRef.current.wasDrag) return; // swallow click after drag
                    setCurrentWeekIdx(wkIdx);
                    setTimeout(() => {
                      document.getElementById(`day-${dateStr}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }, 50);
                  }}
                  className={`flex flex-col items-center rounded-xl px-3 py-1.5 text-xs transition-colors ${
                    complete
                      ? "bg-green-500 text-white"
                      : partial
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        : isActive
                          ? "bg-primary/10 text-primary"
                          : closed
                            ? "text-muted-foreground/50"
                            : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <span className="font-semibold">{mmdd}</span>
                  <span className="opacity-70">{dayLabel}</span>
                  {complete && <Check className="mt-0.5 h-3 w-3" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      </div>


      {/* ── Step 3: Compact day cards ────────────────────────────────── */}
      <div className="mt-4 space-y-3">
        {weekLoading === currentWeekKey ? (
          [1, 2].map((i) => (
            <Card key={`skel-${i}`}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-24" />
              </CardHeader>
              <CardContent className="space-y-2">
                {[1, 2].map((j) => (
                  <div key={j} className="flex gap-3 rounded-lg border p-2">
                    <Skeleton className="h-14 w-14 rounded-lg" />
                    <div className="flex-1 space-y-1.5 py-1">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="flex items-center">
                      <Skeleton className="h-7 w-16 rounded-md" />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        ) : (
          currentWeekDates.map((dateStr) => {
            const allMenusForDay = getMenusForDate(dateStr);
            const mainMenus = allMenusForDay
              .filter((dm) => dm.slot_type === "main" && dm.menu)
              .sort((a, b) => {
                const cat: Record<string, number> = { salad: 0, sandwich: 1, bowl: 2 };
                return (cat[a.menu?.category ?? ""] ?? 99) - (cat[b.menu?.category ?? ""] ?? 99);
              });
            const optionalMenus = allMenusForDay.filter(
              (dm) => dm.slot_type === "optional" && dm.menu
            );

            const dayTotal = getDayTotal(dateStr);
            const dayComplete = !isBrowseOnly && dayTotal >= saladsPerDelivery;
            const closed = !isBrowseOnly && isDateSelectionClosed(dateStr);
            const dt = new Date(dateStr + "T00:00:00");
            const dayLabel = WEEKDAY_LABELS[dt.getDay()];

            return (
              <Card
                key={dateStr}
                id={`day-${dateStr}`}
                className={`pt-3 pb-2 ${isBrowseOnly ? "scroll-mt-20" : "scroll-mt-36"} ${dayComplete ? "border-green-500/30" : ""}`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-sm font-semibold">
                        {`${dt.getMonth() + 1}월 ${dt.getDate()}일`}
                        <span className="ml-1 font-normal text-muted-foreground">({dayLabel})</span>
                      </CardTitle>
                      {dateStr === todayStr && (
                        <Badge className="bg-primary px-1.5 py-0 text-xs text-primary-foreground">
                          오늘
                        </Badge>
                      )}
                      {closed && dayTotal === 0 && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                          마감
                        </Badge>
                      )}
                    </div>
                    {dayComplete ? (
                      <Badge className="gap-1 border-green-500/30 bg-green-50 px-1.5 py-0 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400">
                        <Check className="h-3 w-3" />
                        완료
                      </Badge>
                    ) : !isBrowseOnly && dayTotal > 0 ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-xs">
                        {dayTotal}/{saladsPerDelivery}
                      </Badge>
                    ) : null}
                  </div>
                </CardHeader>

                <CardContent className="space-y-2 pb-2 pt-0">
                  {allMenusForDay.length === 0 ? (
                    <div className="flex items-center gap-2 py-2 text-muted-foreground">
                      <UtensilsCrossed className="h-4 w-4" />
                      <span className="text-sm">배정된 메뉴가 없습니다</span>
                    </div>
                  ) : (
                    <>
                      {/* Main menus (salads) — compact row with 56×56 image */}
                      {mainMenus.map((dm) => {
                        const menu = dm.menu!;
                        const qty = getQuantityForMenu(dateStr, dm.id);
                        return (
                          <div
                            key={dm.id}
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(`/menu/${menu.id}`)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                router.push(`/menu/${menu.id}`);
                              }
                            }}
                            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors ${
                              qty > 0
                                ? "border-green-500/40 bg-green-50/50 dark:bg-green-900/10"
                                : "hover:bg-accent/50 active:bg-accent/70"
                            }`}
                          >
                            {/* Compact 56×56 thumbnail */}
                            <div className="flex-shrink-0">
                              {menu.image_url ? (
                                <img
                                  src={menu.image_url}
                                  alt={menu.title}
                                  className="h-14 w-14 rounded-lg object-cover"
                                />
                              ) : (
                                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted">
                                  <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium leading-snug">
                                {menu.title}
                              </p>
                              {menu.sauce && (
                                <p className="truncate text-xs text-muted-foreground">
                                  {menu.sauce}
                                </p>
                              )}
                              {(menu.protein != null || menu.kcal != null) && (
                                <p className="text-xs text-muted-foreground">
                                  {menu.protein != null && `${menu.protein}g`}
                                  {menu.protein != null && menu.kcal != null && " · "}
                                  {menu.kcal != null && `${menu.kcal}kcal`}
                                </p>
                              )}
                            </div>

                            {!isBrowseOnly && !closed && (
                              <div className="flex-shrink-0">
                                {renderStepper(dm, dateStr, dayTotal, closed)}
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Optional (side) menus — collapsible, collapsed by default */}
                      {optionalMenus.length > 0 && (
                        <PerDaySideSection
                          menus={optionalMenus}
                          dateStr={dateStr}
                          dayTotal={dayTotal}
                          closed={closed}
                          isBrowseOnly={isBrowseOnly}
                          allSame={allSameOptionals}
                          renderStepper={renderStepper}
                          onMenuClick={(id) => router.push(`/menu/${id}`)}
                        />
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Week navigation — compact, below cards */}
      {weekKeys.length > 1 && (
        <div className="mt-4 flex items-center justify-between pb-6">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentWeekIdx <= 0}
            onClick={() => setCurrentWeekIdx((i) => i - 1)}
            className="gap-1 text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            이전 주
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentWeekIdx + 1} / {weekKeys.length} 주차
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={currentWeekIdx >= weekKeys.length - 1}
            onClick={() => setCurrentWeekIdx((i) => i + 1)}
            className="gap-1 text-muted-foreground"
          >
            다음 주
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
