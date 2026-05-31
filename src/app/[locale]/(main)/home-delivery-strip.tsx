"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { Check, UtensilsCrossed } from "lucide-react";
import { isSelectionClosed, formatDateFull, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import type { HomeStripData } from "@/lib/home-page-types";
import { useHomeStripHydration } from "./home-strip-hydration";

interface MenuDetail {
  menuId?: string;
  title: string;
  imageUrl?: string | null;
  sauce?: string | null;
  protein?: number | null;
  kcal?: number | null;
}

interface Props {
  deliveryDates: string[];
  selectedDateSet: string[];
  todayStr: string;
  cutoffDay: number;
  cutoffTime: string;
  /** When true, hide menu selection actions (browse-only for guests). */
  guestMode?: boolean;
}

const DOW_KO = ["일", "월", "화", "수", "목", "금", "토"];
const AUTO_ADVANCE_MS = 2000;
const PANEL_FADE_MS = 200;
const SCROLL_STEP_THRESHOLD = 36;
/** Fixed pause after a normal scroll step — one date per flick without feeling stuck. */
const SCROLL_STEP_LOCK_MS = 400;
/** Longer pause after wrapping first↔last to absorb trackpad inertia. */
const SCROLL_WRAP_LOCK_MS = 540;

function pickDefaultDate(dates: string[], todayStr: string): string | null {
  return dates.find((d) => d >= todayStr) ?? dates[0] ?? null;
}

function isWrapStep(
  currentDate: string | null,
  direction: 1 | -1,
  dates: string[]
): boolean {
  if (!currentDate || dates.length <= 1) return false;
  const idx = dates.indexOf(currentDate);
  if (idx < 0) return false;
  return (
    (idx === 0 && direction === -1) ||
    (idx === dates.length - 1 && direction === 1)
  );
}

function MenuCompactRow({ menu }: { menu: MenuDetail }) {
  const row = (
    <div className="flex min-w-0 items-center gap-3">
      {menu.imageUrl ? (
        <img
          src={menu.imageUrl}
          alt={menu.title}
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
          <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">
          {menu.title}
        </p>
        {menu.sauce && (
          <p className="line-clamp-2 text-xs leading-snug text-muted-foreground">
            {menu.sauce}
          </p>
        )}
        {(menu.protein != null || menu.kcal != null) && (
          <p className="text-xs text-muted-foreground">
            {menu.protein != null ? `${menu.protein}g` : ""}
            {menu.protein != null && menu.kcal != null ? " · " : ""}
            {menu.kcal != null ? `${menu.kcal}kcal` : ""}
          </p>
        )}
      </div>
    </div>
  );

  if (!menu.menuId) return row;

  return (
    <Link
      href={`/menu/${menu.menuId}`}
      className="-mx-1 block rounded-lg px-1 py-0.5 transition-colors hover:bg-accent/60 active:bg-accent"
    >
      {row}
    </Link>
  );
}

interface DetailContentProps {
  dateIso: string;
  dateLabel: string;
  statusBadge: { label: string; className: string } | null;
  showClosedMessage: boolean;
  showPendingMessage: boolean;
  selectedMenus: MenuDetail[];
  availableMenus: MenuDetail[];
  showSelectButton: boolean;
  showChangeButton: boolean;
}

function StripMenuSkeleton() {
  return (
    <div className="mt-2 flex flex-col gap-2">
      {[0, 1].map((i) => (
        <div key={i} className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-14 w-14 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailContent({
  dateIso,
  dateLabel,
  statusBadge,
  showClosedMessage,
  showPendingMessage,
  selectedMenus,
  availableMenus,
  showSelectButton,
  showChangeButton,
  menusLoading = false,
}: DetailContentProps & { menusLoading?: boolean }) {
  const hasMenuBlock = selectedMenus.length > 0;
  const hasAvailableBlock = availableMenus.length > 0;
  const hasActionBlock = showSelectButton || showChangeButton;
  const menuHref = `/menu?date=${dateIso}`;

  return (
    <div className="w-full min-w-0 text-left">
      <div className="flex flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-base font-semibold leading-tight">{dateLabel}</p>
          {statusBadge && (
            <Badge variant="secondary" className={`text-xs ${statusBadge.className}`}>
              {statusBadge.label}
            </Badge>
          )}
        </div>
        {showClosedMessage && (
          <p className="text-sm text-muted-foreground">메뉴 선택 기간이 지났어요.</p>
        )}
        {showPendingMessage && (
          <p className="text-sm text-muted-foreground">아직 메뉴를 선택하지 않았어요.</p>
        )}
      </div>

      {menusLoading && <StripMenuSkeleton />}

      {!menusLoading && (hasMenuBlock || hasAvailableBlock || hasActionBlock) && (
        <div className="mt-2 flex flex-col gap-2">
          {selectedMenus.map((menu, i) => (
            <MenuCompactRow key={`sel-${i}`} menu={menu} />
          ))}
          {hasAvailableBlock && (
            <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-2">
              {availableMenus.slice(0, 2).map((menu, i) => (
                <MenuCompactRow key={`avail-${i}`} menu={menu} />
              ))}
            </div>
          )}
          {showSelectButton && (
            <Link href={menuHref} className="block w-full">
              <Button size="sm" className="h-9 w-full text-sm">
                메뉴 선택하기
              </Button>
            </Link>
          )}
          {showChangeButton && (
            <Link href={menuHref} className="block w-full">
              <Button variant="outline" size="sm" className="h-9 w-full text-sm">
                메뉴 변경하기
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

export function HomeDeliveryStrip({
  deliveryDates,
  selectedDateSet,
  todayStr,
  cutoffDay,
  cutoffTime,
  guestMode = false,
}: Props) {
  const hydration = useHomeStripHydration();
  const [menuDetailByDate, setMenuDetailByDate] = useState<
    Record<string, MenuDetail[]>
  >({});
  const [availableMenusByDate, setAvailableMenusByDate] = useState<
    Record<string, MenuDetail[]>
  >({});
  const [guestBrowseMenusByDate, setGuestBrowseMenusByDate] = useState<
    Record<string, MenuDetail[]>
  >({});

  const mergeStripData = useCallback((data: HomeStripData) => {
    setMenuDetailByDate(data.menuDetailByDate);
    setAvailableMenusByDate(data.availableMenusByDate);
    setGuestBrowseMenusByDate(data.guestBrowseMenusByDate);
  }, []);

  useEffect(() => {
    if (!hydration) return;
    return hydration.registerHydrate(mergeStripData);
  }, [hydration, mergeStripData]);

  const stripDataPending = hydration?.stripDataPending ?? false;
  const stripMenuDetailByDate = guestMode ? {} : menuDetailByDate;
  const stripAvailableMenusByDate = guestMode
    ? guestBrowseMenusByDate
    : availableMenusByDate;

  const selectedSet = new Set(selectedDateSet);
  const chipListRef = useRef<HTMLDivElement>(null);
  const contentPanelRef = useRef<HTMLDivElement>(null);
  const stripRootRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const chipDragRef = useRef({
    dragging: false,
    startY: 0,
    scrollTop: 0,
    wasDrag: false,
    pointerId: 0,
  });
  const [fixedPanelH, setFixedPanelH] = useState<number | undefined>();

  const defaultDate = pickDefaultDate(deliveryDates, todayStr);
  const [activeDate, setActiveDate] = useState<string | null>(defaultDate);
  const [displayDate, setDisplayDate] = useState<string | null>(defaultDate);
  const [panelVisible, setPanelVisible] = useState(true);
  const autoAdvancePausedRef = useRef(false);
  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeDateRef = useRef<string | null>(defaultDate);
  const stripInViewRef = useRef(true);

  function getChipScrollTop(chipList: HTMLDivElement, chip: HTMLElement): number {
    return (
      chip.getBoundingClientRect().top -
      chipList.getBoundingClientRect().top +
      chipList.scrollTop
    );
  }

  function scrollChipIntoView(
    chipList: HTMLDivElement,
    dateStr: string,
    smooth: boolean
  ) {
    const chip = chipList.querySelector<HTMLElement>(`[data-date="${dateStr}"]`);
    if (!chip) return;
    const chipTop = getChipScrollTop(chipList, chip);
    const chipBottom = chipTop + chip.offsetHeight;
    const viewTop = chipList.scrollTop;
    const viewBottom = viewTop + chipList.clientHeight;
    if (chipTop < viewTop) {
      chipList.scrollTo({ top: chipTop, behavior: smooth ? "smooth" : "auto" });
    } else if (chipBottom > viewBottom) {
      chipList.scrollTo({
        top: chipBottom - chipList.clientHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }

  const deliveryDatesKey = deliveryDates.join(",");

  // When the date list changes (e.g. login/logout), drop stale selections.
  // Derive dates from the serialized key inside the effect so React Compiler
  // does not infer a variable-length dependency array from `deliveryDates`.
  useEffect(() => {
    const dates =
      deliveryDatesKey.length > 0 ? deliveryDatesKey.split(",") : [];
    const next = pickDefaultDate(dates, todayStr);
    setActiveDate((cur) => (cur && dates.includes(cur) ? cur : next));
    setDisplayDate((cur) => (cur && dates.includes(cur) ? cur : next));
    setPanelVisible(true);
    autoAdvancePausedRef.current = false;
  }, [deliveryDatesKey, todayStr]);

  useEffect(() => {
    activeDateRef.current = activeDate;
  }, [activeDate]);

  const selectDate = useCallback((dateStr: string, manual = false) => {
    if (manual) autoAdvancePausedRef.current = true;
    setActiveDate(dateStr);
  }, []);

  const stepActiveDate = useCallback(
    (direction: 1 | -1) => {
      autoAdvancePausedRef.current = true;
      setActiveDate((cur) => {
        if (!cur) return deliveryDates[0] ?? null;
        const idx = deliveryDates.indexOf(cur);
        if (idx < 0) return deliveryDates[0] ?? null;
        const nextIdx =
          (idx + direction + deliveryDates.length) % deliveryDates.length;
        return deliveryDates[nextIdx];
      });
    },
    [deliveryDates]
  );

  const isClosedNoMenuDate = (dateStr: string) => {
    const hasMenu = selectedSet.has(dateStr);
    const selectionOpen = !isSelectionClosed(dateStr, cutoffDay, cutoffTime);
    return !hasMenu && !selectionOpen;
  };

  const referenceClosedDate =
    deliveryDates.find(
      (d) =>
        isClosedNoMenuDate(d) &&
        d >= todayStr &&
        (stripAvailableMenusByDate[d]?.length ?? 0) > 0
    ) ??
    deliveryDates.find((d) => isClosedNoMenuDate(d) && d >= todayStr) ??
    null;

  const referenceClosedMenus = referenceClosedDate
    ? (stripAvailableMenusByDate[referenceClosedDate] ?? []).slice(0, 2)
    : [];

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el) return;
    const sync = () => setFixedPanelH(el.offsetHeight);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [referenceClosedDate, referenceClosedMenus.length]);

  useEffect(() => {
    const el = stripRootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        stripInViewRef.current = entry.isIntersecting;
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = chipListRef.current;
    if (!el || !activeDate) return;
    scrollChipIntoView(el, activeDate, true);
  }, [activeDate, deliveryDates]);

  // Scroll / swipe on the content panel — one date per scroll, fixed brief lock after each step.
  useEffect(() => {
    const el = contentPanelRef.current;
    if (!el || deliveryDates.length <= 1) return;

    let wheelAccum = 0;
    let lockedUntil = 0;
    let touchStartY = 0;
    let touchTracking = false;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();

      const now = Date.now();
      if (now < lockedUntil) {
        wheelAccum = 0;
        return;
      }

      wheelAccum += e.deltaY;
      if (Math.abs(wheelAccum) < SCROLL_STEP_THRESHOLD) return;

      const direction = wheelAccum > 0 ? 1 : -1;
      const lockMs = isWrapStep(activeDateRef.current, direction, deliveryDates)
        ? SCROLL_WRAP_LOCK_MS
        : SCROLL_STEP_LOCK_MS;

      stepActiveDate(direction);
      wheelAccum = 0;
      lockedUntil = now + lockMs;
    };

    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0]?.clientY ?? 0;
      touchTracking = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchTracking) return;
      const y = e.touches[0]?.clientY ?? touchStartY;
      if (Math.abs(y - touchStartY) > 8) {
        e.preventDefault();
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      touchTracking = false;
      const now = Date.now();
      if (now < lockedUntil) return;

      const endY = e.changedTouches[0]?.clientY;
      if (endY == null) return;
      const delta = touchStartY - endY;
      if (Math.abs(delta) < SCROLL_STEP_THRESHOLD) return;

      const direction = delta > 0 ? 1 : -1;
      const lockMs = isWrapStep(activeDateRef.current, direction, deliveryDates)
        ? SCROLL_WRAP_LOCK_MS
        : SCROLL_STEP_LOCK_MS;

      stepActiveDate(direction);
      lockedUntil = now + lockMs;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [deliveryDates, stepActiveDate]);

  // Fade out → swap content → fade in when the selected date changes.
  useEffect(() => {
    if (!activeDate || activeDate === displayDate) return;

    setPanelVisible(false);
    if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);

    fadeTimeoutRef.current = setTimeout(() => {
      setDisplayDate(activeDate);
      requestAnimationFrame(() => setPanelVisible(true));
    }, PANEL_FADE_MS);

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [activeDate, displayDate]);

  // Auto-advance to the next date every 2s until the user picks manually.
  useEffect(() => {
    if (deliveryDates.length <= 1) return;

    const id = setInterval(() => {
      if (!stripInViewRef.current || autoAdvancePausedRef.current) return;
      setActiveDate((cur) => {
        if (!cur) return deliveryDates[0] ?? null;
        const idx = deliveryDates.indexOf(cur);
        if (idx < 0) return deliveryDates[0] ?? null;
        return deliveryDates[(idx + 1) % deliveryDates.length];
      });
    }, AUTO_ADVANCE_MS);

    return () => clearInterval(id);
  }, [deliveryDates]);

  if (deliveryDates.length === 0) return null;

  const panelDate = displayDate;
  const activeDateMenus = panelDate ? (stripMenuDetailByDate[panelDate] ?? []) : [];
  const activeDateAvailable = panelDate
    ? (stripAvailableMenusByDate[panelDate] ?? [])
    : [];
  const activeDateHasMenu = panelDate ? selectedSet.has(panelDate) : false;
  const activeDateSelectionOpen = panelDate
    ? !isSelectionClosed(panelDate, cutoffDay, cutoffTime)
    : false;
  const activeDateIsPast = panelDate ? panelDate < todayStr : false;
  const activeDateClosedNoMenu =
    panelDate && !activeDateHasMenu && !activeDateSelectionOpen;

  const statusBadge =
    panelDate && activeDateIsPast
      ? { label: "배송 완료", className: "bg-muted text-muted-foreground" }
      : null;

  const cardHeight =
    fixedPanelH != null ? { height: fixedPanelH, minHeight: fixedPanelH } : undefined;

  return (
    <div
      ref={stripRootRef}
      style={cardHeight}
      className="flex items-stretch gap-1 overflow-hidden overscroll-contain rounded-xl ring-1 ring-foreground/10"
    >
      {/* Left: scrollable chip column — padding on outer shell so scroll never clips it */}
      <div
        style={fixedPanelH != null ? { height: fixedPanelH, minHeight: fixedPanelH } : undefined}
        className="flex w-[80px] shrink-0 flex-col py-2.5 pl-2.5 pr-1.5"
      >
        <div
          ref={chipListRef}
          className="flex min-h-0 flex-1 cursor-grab touch-pan-y flex-col gap-1.5 overflow-y-auto overscroll-y-contain active:cursor-grabbing [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={(e) => {
            const el = chipListRef.current;
            if (!el) return;
            chipDragRef.current = {
              dragging: true,
              startY: e.clientY,
              scrollTop: el.scrollTop,
              wasDrag: false,
              pointerId: e.pointerId,
            };
          }}
          onPointerMove={(e) => {
            if (!chipDragRef.current.dragging) return;
            const el = chipListRef.current;
            if (!el) return;
            const dy = e.clientY - chipDragRef.current.startY;
            if (Math.abs(dy) > 5) {
              if (!chipDragRef.current.wasDrag) {
                el.setPointerCapture(chipDragRef.current.pointerId);
              }
              chipDragRef.current.wasDrag = true;
              el.scrollTop = chipDragRef.current.scrollTop - dy;
            }
          }}
          onPointerUp={() => {
            chipDragRef.current.dragging = false;
          }}
          onPointerCancel={() => {
            chipDragRef.current.dragging = false;
          }}
          onWheel={(e) => {
            const el = chipListRef.current;
            if (!el) return;
            el.scrollTop += e.deltaY;
          }}
        >
          {deliveryDates.map((dateStr) => {
            const isPast = dateStr < todayStr;
            const isToday = dateStr === todayStr;
            const hasMenu = selectedSet.has(dateStr);
            const selectionOpen = !isSelectionClosed(dateStr, cutoffDay, cutoffTime);
            const closedNoMenu = isClosedNoMenuDate(dateStr);
            const isActive = dateStr === activeDate;

            const d = new Date(dateStr + "T00:00:00");
            const month = d.getMonth() + 1;
            const day = d.getDate();
            const dow = DOW_KO[d.getDay()];

            let chipCls = "bg-muted/60 text-muted-foreground";
            if (isActive) {
              chipCls = hasMenu
                ? "bg-green-500 text-white"
                : selectionOpen
                  ? "bg-amber-400 text-white"
                  : "bg-muted text-muted-foreground";
            } else if (!isPast) {
              chipCls = hasMenu
                ? "bg-green-100 text-green-800"
                : selectionOpen
                  ? "bg-amber-100 text-amber-800"
                  : "bg-muted/60 text-muted-foreground";
            }

            if (isToday && !isActive) chipCls += " ring-1 ring-foreground/30";

            const showStatusIndicator =
              hasMenu ||
              (closedNoMenu && !guestMode) ||
              (selectionOpen && !isPast);

            return (
              <button
                key={dateStr}
                data-date={dateStr}
                onClick={() => {
                  if (chipDragRef.current.wasDrag) {
                    chipDragRef.current.wasDrag = false;
                    return;
                  }
                  selectDate(dateStr, true);
                }}
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center rounded-lg px-1.5 text-center transition-all duration-200",
                  showStatusIndicator ? "py-2.5" : "min-h-[52px] py-2",
                  chipCls
                )}
              >
                <span className="text-sm font-semibold leading-tight">
                  {month}/{day}
                </span>
                <span className="text-xs leading-tight opacity-80">{dow}</span>
                {showStatusIndicator ? (
                  <div className="mt-1 flex h-3.5 items-center justify-center">
                    {hasMenu ? (
                      <Check className="h-3 w-3" />
                    ) : closedNoMenu && !guestMode ? (
                      <span className="text-[10px] font-medium leading-none">마감</span>
                    ) : selectionOpen && !isPast ? (
                      <span className="block h-1 w-1 rounded-full bg-current opacity-60" />
                    ) : null}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: detail panel — scroll / swipe here to change dates */}
      <div
        ref={contentPanelRef}
        className="relative flex min-h-0 min-w-0 flex-1 touch-none flex-col overscroll-contain"
      >
        {referenceClosedDate && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-hidden opacity-0"
          >
            <div ref={measureRef} className="w-full py-2.5 pl-2 pr-3">
              <DetailContent
                dateIso={referenceClosedDate}
                dateLabel={formatDateFull(referenceClosedDate)}
                statusBadge={null}
                showClosedMessage
                showPendingMessage={false}
                selectedMenus={[]}
                availableMenus={referenceClosedMenus}
                showSelectButton={false}
                showChangeButton={false}
              />
            </div>
          </div>
        )}

        <div className="flex h-full min-h-0 flex-1 flex-col justify-center py-2.5 pl-2 pr-3">
          <div
            className={cn(
              "transition-opacity duration-200 ease-in-out",
              panelVisible ? "opacity-100" : "opacity-0"
            )}
          >
            {panelDate ? (
              <DetailContent
                dateIso={panelDate}
                dateLabel={formatDateFull(panelDate)}
                statusBadge={statusBadge}
                showClosedMessage={
                  !guestMode &&
                  !stripDataPending &&
                  !!(activeDateClosedNoMenu && !activeDateIsPast)
                }
                showPendingMessage={
                  !guestMode &&
                  !stripDataPending &&
                  !activeDateHasMenu &&
                  !activeDateIsPast &&
                  activeDateSelectionOpen
                }
                selectedMenus={activeDateHasMenu ? activeDateMenus : []}
                availableMenus={
                  guestMode
                    ? activeDateAvailable
                    : activeDateClosedNoMenu && !activeDateHasMenu
                      ? activeDateAvailable
                      : []
                }
                showSelectButton={
                  !guestMode &&
                  !stripDataPending &&
                  !activeDateIsPast &&
                  activeDateSelectionOpen &&
                  !activeDateHasMenu
                }
                showChangeButton={
                  !guestMode &&
                  !stripDataPending &&
                  activeDateHasMenu &&
                  !activeDateIsPast &&
                  activeDateSelectionOpen
                }
                menusLoading={stripDataPending}
              />
            ) : (
              <p className="text-sm text-muted-foreground">날짜를 선택해 주세요.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
