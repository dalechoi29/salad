"use client";

import { useState, useEffect, useCallback } from "react";
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
  Loader2,
  CalendarDays,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDateShort } from "@/lib/utils";
import type { DailyMenu, MenuSelection, DietaryPreference } from "@/types";
import {
  getDailyMenus,
  getMyMenuSelections,
  selectMenu,
  toggleFavorite,
  getMyFavorites,
} from "@/lib/actions/menu";
import { handleActionError } from "@/lib/handle-action-error";

const DIETARY_LABELS: Record<string, string> = {
  vegan: "비건",
  gluten_free: "글루텐프리",
  nut_free: "견과류 없음",
  dairy_free: "유제품 없음",
  low_carb: "저탄수화물",
  high_protein: "고단백",
};

function getWeekdaysBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");

  while (current <= endDate) {
    const dow = current.getDay();
    if (dow >= 1 && dow <= 5) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
    }
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getWeekNumber(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isSelectionClosed(deliveryDateStr: string): boolean {
  const deliveryDate = new Date(deliveryDateStr + "T00:00:00");
  const cutoff = new Date(deliveryDate);
  cutoff.setDate(cutoff.getDate() - 2);
  cutoff.setHours(16, 0, 0, 0);
  return new Date() >= cutoff;
}

interface MenuSelectionViewProps {
  deliveryStart: string | null;
  deliveryEnd: string | null;
  myDeliveryDates?: string[];
  todayStr?: string;
}

export function MenuSelectionView({
  deliveryStart,
  deliveryEnd,
  myDeliveryDates,
  todayStr,
}: MenuSelectionViewProps) {
  const [dailyMenus, setDailyMenus] = useState<DailyMenu[]>([]);
  const [selections, setSelections] = useState<MenuSelection[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectingDate, setSelectingDate] = useState<string | null>(null);

  const router = useRouter();
  const allWeekdays =
    deliveryStart && deliveryEnd
      ? getWeekdaysBetween(deliveryStart, deliveryEnd)
      : [];

  const deliveryDateSet = myDeliveryDates && myDeliveryDates.length > 0
    ? new Set(myDeliveryDates)
    : null;

  const filteredWeekdays = deliveryDateSet
    ? allWeekdays.filter((d) => deliveryDateSet.has(d))
    : [];

  const isBrowseOnly = !deliveryDateSet || filteredWeekdays.length === 0;
  const weekdays = isBrowseOnly ? allWeekdays : filteredWeekdays;

  const weeks = weekdays.reduce<Record<string, string[]>>((acc, date) => {
    const week = getWeekNumber(date);
    if (!acc[week]) acc[week] = [];
    acc[week].push(date);
    return acc;
  }, {});

  const weekKeys = Object.keys(weeks).sort();

  const [currentWeekIdx, setCurrentWeekIdx] = useState(0);
  const currentWeekKey = weekKeys[currentWeekIdx] ?? "";
  const currentWeekDates = weeks[currentWeekKey] ?? [];

  const loadData = useCallback(async () => {
    if (!deliveryStart || !deliveryEnd) return;

    setLoading(true);
    try {
      const [menuData, selData, favData] = await Promise.all([
        getDailyMenus(deliveryStart, deliveryEnd),
        getMyMenuSelections(deliveryStart, deliveryEnd),
        getMyFavorites(),
      ]);
      setDailyMenus(menuData);
      setSelections(selData);
      setFavoriteIds(new Set(favData.map((f) => f.menu_id)));
    } finally {
      setLoading(false);
    }
  }, [deliveryStart, deliveryEnd]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (weekKeys.length > 0) {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const nextDate = weekdays.find((d) => d >= todayStr);
      if (nextDate) {
        const nextWeek = getWeekNumber(nextDate);
        const idx = weekKeys.indexOf(nextWeek);
        if (idx >= 0) {
          setCurrentWeekIdx(idx);
          return;
        }
      }

      const todayWeek = getWeekNumber(todayStr);
      const idx = weekKeys.indexOf(todayWeek);
      if (idx >= 0) {
        setCurrentWeekIdx(idx);
      } else {
        setCurrentWeekIdx(weekKeys.length - 1);
      }
    }
  }, [weekKeys.length]);

  function getMenusForDate(dateStr: string): DailyMenu[] {
    return dailyMenus.filter((dm) => dm.delivery_date === dateStr);
  }

  function getSelectionForDate(dateStr: string): MenuSelection | undefined {
    return selections.find((s) => s.delivery_date === dateStr);
  }

  async function handleSelect(dailyMenuId: string, dateStr: string) {
    setSelectingDate(dateStr);
    try {
      const result = await selectMenu(dailyMenuId, dateStr);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("메뉴가 선택되었습니다");

      const matchingMenu = dailyMenus.find((dm) => dm.id === dailyMenuId);
      setSelections((prev) => {
        const filtered = prev.filter((s) => s.delivery_date !== dateStr);
        return [
          ...filtered,
          {
            id: `temp-${Date.now()}`,
            user_id: "",
            daily_menu_id: dailyMenuId,
            delivery_date: dateStr,
            daily_menu_assignment: matchingMenu ?? null,
            created_at: new Date().toISOString(),
          } as MenuSelection,
        ];
      });
    } finally {
      setSelectingDate(null);
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
        <h1 className="text-2xl font-bold tracking-tight">메뉴 선택</h1>
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const selectedCount = selections.length;
  const totalDates = weekdays.length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {isBrowseOnly ? "이달의 메뉴" : "메뉴 선택"}
        </h1>
        {!isBrowseOnly && (
          <Badge variant="secondary" className="text-sm">
            {selectedCount}/{totalDates} 선택됨
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="icon"
          disabled={currentWeekIdx <= 0}
          onClick={() => setCurrentWeekIdx((i) => i - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium">
          {currentWeekDates.length > 0 && (
            <>
              {formatDateShort(currentWeekDates[0])} ~{" "}
              {formatDateShort(currentWeekDates[currentWeekDates.length - 1])}
            </>
          )}
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={currentWeekIdx >= weekKeys.length - 1}
          onClick={() => setCurrentWeekIdx((i) => i + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {currentWeekDates.map((dateStr) => {
          const menusForDay = getMenusForDate(dateStr);
          const selection = getSelectionForDate(dateStr);
          const isSelecting = selectingDate === dateStr;
          const closed = !isBrowseOnly && isSelectionClosed(dateStr);

          return (
            <Card key={dateStr}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">
                      {formatDateShort(dateStr)}
                    </CardTitle>
                    {todayStr === dateStr && (
                      <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0">
                        Today
                      </Badge>
                    )}
                    {closed && !selection && (
                      <Badge variant="secondary" className="text-xs px-2 py-0">
                        마감
                      </Badge>
                    )}
                  </div>
                  {!isBrowseOnly && selection && (
                    <Badge
                      variant="outline"
                      className="border-green-500/30 bg-green-50 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-400"
                    >
                      <Check className="mr-0.5 h-3 w-3" />
                      선택 완료
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {menusForDay.length === 0 ? (
                  <div className="flex items-center gap-2 py-3 text-muted-foreground">
                    <UtensilsCrossed className="h-4 w-4" />
                    <span className="text-sm">배정된 메뉴가 없습니다</span>
                  </div>
                ) : (
                  menusForDay.map((dm, idx) => {
                    const isSelected =
                      selection?.daily_menu_id === dm.id;
                    const menu = dm.menu;
                    if (!menu) return null;
                    const isFav = favoriteIds.has(menu.id);

                    return (
                      <div
                        key={dm.id}
                        className={`flex gap-3 rounded-lg border p-2.5 transition-colors ${
                          !isBrowseOnly && isSelected
                            ? "border-green-500/40 bg-green-50/50 dark:bg-green-900/10"
                            : "hover:bg-accent/30"
                        }`}
                      >
                        <Link
                          href={`/menu/${menu.id}`}
                          className="flex-shrink-0"
                        >
                          {menu.image_url ? (
                            <img
                              src={menu.image_url}
                              alt={menu.title}
                              className="h-24 w-24 rounded-lg object-cover"
                            />
                          ) : (
                            <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-muted">
                              <UtensilsCrossed className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </Link>

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/menu/${menu.id}`}
                            className="text-lg font-bold leading-tight hover:underline"
                          >
                            {idx + 1}
                          </Link>
                          <Link
                            href={`/menu/${menu.id}`}
                            className="block text-sm font-medium leading-snug hover:underline"
                          >
                            {menu.title}
                          </Link>
                          {menu.sauce && (
                            <p className="text-sm text-muted-foreground">
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

                        {!isBrowseOnly && (
                          <div className="flex flex-shrink-0 items-center">
                            {isSelected ? (
                              <Button
                                size="sm"
                                className="h-8 gap-1 bg-green-600 text-sm text-white hover:bg-green-700"
                                disabled
                              >
                                <Check className="h-3.5 w-3.5" />
                                선택됨
                              </Button>
                            ) : closed ? null : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-sm"
                                disabled={isSelecting}
                                onClick={() =>
                                  handleSelect(dm.id, dateStr)
                                }
                              >
                                {isSelecting ? (
                                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                ) : null}
                                {selection ? "변경" : "선택"}
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
