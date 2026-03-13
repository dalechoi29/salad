"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  BarChart3,
  UtensilsCrossed,
  Package,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getDeliverySummary } from "@/lib/actions/admin";
import { formatDateShort, getTodayStr, getMonthRange, formatMonthLabel } from "@/lib/utils";
import type { DailySummaryItem } from "@/lib/actions/admin";

export function DeliverySummaryView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<DailySummaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const todayStr = getTodayStr();

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getMonthRange(year, month);
      const data = await getDeliverySummary(start, end);
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  function goToPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goToNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  const totalAllSalads = summary.reduce((sum, d) => sum + d.totalSalads, 0);
  const totalDays = summary.length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link
          href="/admin"
          className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <BarChart3 className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">배달 현황</h1>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold">
          {formatMonthLabel(year, month)}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={goToNextMonth}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                  <Package className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAllSalads}</p>
                  <p className="text-xs text-muted-foreground">총 주문 수</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                  <UtensilsCrossed className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalDays}</p>
                  <p className="text-xs text-muted-foreground">배달일 수</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {summary.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="mb-2 h-8 w-8" />
                <p className="text-sm">주문 데이터가 없습니다</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {summary.map((day) => {
                const isToday = day.date === todayStr;
                const isPast = day.date < todayStr;

                return (
                  <Card
                    key={day.date}
                    className={
                      isToday
                        ? "border-primary/30 bg-primary/5"
                        : isPast
                          ? "opacity-75"
                          : ""
                    }
                  >
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {formatDateShort(day.date)}
                          </span>
                          {isToday && (
                            <Badge className="text-[10px]">오늘</Badge>
                          )}
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          총 {day.totalSalads}개
                        </Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        {day.menuBreakdown.map((menu) => (
                          <div
                            key={menu.menuId}
                            className="flex items-center gap-3"
                          >
                            {menu.menuImage ? (
                              <img
                                src={menu.menuImage}
                                alt={menu.menuTitle}
                                className="h-10 w-10 rounded-md object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                                <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium leading-tight">
                                {menu.menuTitle}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-lg font-bold text-primary">
                                {menu.count}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                개
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
