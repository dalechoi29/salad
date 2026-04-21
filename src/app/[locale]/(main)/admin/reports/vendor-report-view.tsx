"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  FileSpreadsheet,
  Copy,
  MessageSquareText,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import {
  getMenuSelectionCutoff,
  getVendorReport,
  type VendorReportRow,
} from "@/lib/actions/admin";
import {
  formatMonthLabel,
  getMonthRange,
  isSelectionClosed,
} from "@/lib/utils";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function getMondayISO(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatWeekRange(mondayISO: string): string {
  const mon = new Date(mondayISO + "T00:00:00");
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const mm = mon.getMonth() + 1;
  const md = mon.getDate();
  const sm = sun.getMonth() + 1;
  const sd = sun.getDate();
  return `${mm}/${md} ~ ${sm}/${sd}`;
}

export function VendorReportView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<VendorReportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [cutoff, setCutoff] = useState<{ day: number; time: string }>({
    day: 4,
    time: "23:59",
  });

  // Cutoff is global admin config; fetch once on mount.
  useEffect(() => {
    let cancelled = false;
    getMenuSelectionCutoff().then((c) => {
      if (!cancelled) setCutoff(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const { start, end } = getMonthRange(year, month);
      const data = await getVendorReport(start, end);
      if (!cancelled) {
        setRows(data);
        setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  // Derive a locked/open flag per row so each render doesn't recompute per
  // cell. Recomputed only when rows or cutoff change.
  const rowStatus = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of rows) {
      m.set(r.date, isSelectionClosed(r.date, cutoff.day, cutoff.time));
    }
    return m;
  }, [rows, cutoff.day, cutoff.time]);

  function goToPrevMonth() {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  }

  function goToNextMonth() {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  }

  function exportCSV() {
    if (rows.length === 0) return;

    const allMenus = new Set<string>();
    for (const row of rows) {
      for (const m of row.menuBreakdown) allMenus.add(m.menuTitle);
    }
    const menuList = Array.from(allMenus).sort();

    const header = ["날짜", "총 주문수", ...menuList];
    const csvRows = [header.join(",")];

    for (const row of rows) {
      const menuMap = new Map(row.menuBreakdown.map((m) => [m.menuTitle, m.count]));
      const line = [
        row.date,
        row.totalSalads,
        ...menuList.map((name) => menuMap.get(name) ?? 0),
      ];
      csvRows.push(line.join(","));
    }

    const totalRow = [
      "합계",
      rows.reduce((s, r) => s + r.totalSalads, 0),
      ...menuList.map((name) =>
        rows.reduce((s, r) => {
          const found = r.menuBreakdown.find((m) => m.menuTitle === name);
          return s + (found?.count ?? 0);
        }, 0)
      ),
    ];
    csvRows.push(totalRow.join(","));

    const bom = "\uFEFF";
    const blob = new Blob([bom + csvRows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendor-report-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Group rows by ISO week (Mon–Sun) for the summary view ────────────────
  const weekGroups = useMemo(() => {
    const map = new Map<string, VendorReportRow[]>();
    for (const r of rows) {
      const mon = getMondayISO(r.date);
      if (!map.has(mon)) map.set(mon, []);
      map.get(mon)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([mondayISO, weekRows]) => ({
        mondayISO,
        rangeLabel: formatWeekRange(mondayISO),
        rows: weekRows,
      }));
  }, [rows]);

  function formatDailyLine(row: VendorReportRow): string {
    const dateObj = new Date(row.date + "T00:00:00");
    const m = dateObj.getMonth() + 1;
    const d = dateObj.getDate();
    const dow = WEEKDAY_LABELS[dateObj.getDay()];
    const menuParts = row.menuBreakdown
      .map((mb) => `${mb.menuTitle} ${mb.count}개`)
      .join(", ");
    return `- ${m}월 ${d}일(${dow})\n${menuParts}`;
  }

  function generateWeeklySummary(weekRows: VendorReportRow[]): string {
    const body = weekRows.map(formatDailyLine).join("\n\n");
    return `안녕하세요! 이번주 메뉴 전달드려요:)\n\n${body}`;
  }

  const grandTotal = rows.reduce((s, r) => s + r.totalSalads, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">납품 보고서</h1>
      </div>

      {/* Month navigation + export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToPrevMonth}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[100px] text-center text-sm font-semibold">
            {formatMonthLabel(year, month)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={goToNextMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={exportCSV}
          disabled={rows.length === 0}
        >
          <Download className="mr-1.5 h-4 w-4" />
          CSV 내보내기
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <FileSpreadsheet className="h-8 w-8" />
            <p className="text-sm">해당 월의 데이터가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-muted-foreground">총 주문 수</p>
                <p className="text-3xl font-bold">{grandTotal}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-muted-foreground">배달 일수</p>
                <p className="text-3xl font-bold">{rows.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 text-center">
                <p className="text-xs text-muted-foreground">일 평균</p>
                <p className="text-3xl font-bold">
                  {(grandTotal / rows.length).toFixed(1)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Summary message (per week) */}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowSummary((v) => !v)}
          >
            <MessageSquareText className="mr-1.5 h-4 w-4" />
            {showSummary ? "요약 메시지 숨기기" : "요약 메시지 보기"}
          </Button>

          {showSummary && (
            <div className="space-y-3">
              {weekGroups.map((wg) => {
                const text = generateWeeklySummary(wg.rows);
                return (
                  <div
                    key={wg.mondayISO}
                    className="relative rounded-lg bg-muted/70 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {wg.rangeLabel}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => {
                          navigator.clipboard.writeText(text);
                          toast.success("클립보드에 복사되었습니다");
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                      {text}
                    </pre>
                  </div>
                );
              })}
            </div>
          )}

          {/* Detail table */}
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-sm">일별 상세</CardTitle>
              <p className="text-xs text-muted-foreground">
                <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 font-semibold">
                  마감
                </span>{" "}
                표시가 있는 날은 메뉴 선택이 마감되어 수량이 확정되었어요.
                나머지 날은 신청 변경으로 수량이 달라질 수 있어요.
              </p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">날짜</th>
                    <th className="py-2 pr-4 font-medium">총 주문</th>
                    <th className="py-2 font-medium">메뉴 내역</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const closed = rowStatus.get(row.date) ?? false;
                    return (
                    <tr key={row.date} className="border-b align-top last:border-0">
                      <td className="py-2.5 pr-4 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{row.date}</span>
                          {closed && (
                            <Badge
                              variant="secondary"
                              className="px-1.5 py-0 text-[10px]"
                            >
                              마감
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 font-bold">{row.totalSalads}</td>
                      <td className="py-2.5">
                        <div className="flex flex-col gap-2">
                          {row.menuBreakdown.map((m) => (
                            <div key={m.menuTitle} className="flex flex-col gap-1">
                              <span className="inline-flex w-fit items-center rounded-full bg-secondary px-2 py-0.5 text-xs">
                                {m.menuTitle}
                                <span className="ml-1 font-bold">{m.count}</span>
                              </span>
                              {m.pickers.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {m.pickers
                                    .map((p) =>
                                      p.count > 1
                                        ? `${p.name}×${p.count}`
                                        : p.name
                                    )
                                    .join(", ")}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-bold">
                    <td className="py-2.5 pr-4">합계</td>
                    <td className="py-2.5 pr-4">{grandTotal}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
