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
import { Calendar } from "@/components/ui/calendar";
import {
  addHoliday,
  removeHoliday,
  importKoreanHolidays,
  getHolidays,
} from "@/lib/actions/holiday";
import { toast } from "sonner";
import {
  CalendarOff,
  Plus,
  Trash2,
  Loader2,
  Download,
  ArrowLeft,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Holiday } from "@/types";

interface HolidayManagementProps {
  initialHolidays: Holiday[];
  year: number;
}

export function HolidayManagement({
  initialHolidays,
  year: initialYear,
}: HolidayManagementProps) {
  const [holidays, setHolidays] = useState(initialHolidays);
  const [year, setYear] = useState(initialYear);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  const holidayDates = new Set(holidays.map((h) => h.holiday_date));

  async function loadYear(y: number) {
    setYear(y);
    const data = await getHolidays(y);
    setHolidays(data);
  }

  async function handleAdd() {
    if (!newDate || !newName.trim()) {
      toast.error("날짜와 이름을 입력해주세요");
      return;
    }

    setIsAdding(true);
    try {
      const result = await addHoliday(newDate, newName.trim());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("공휴일이 추가되었습니다");
      setNewDate("");
      setNewName("");
      setSelectedDate(undefined);
      const data = await getHolidays(year);
      setHolidays(data);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRemove(id: string) {
    const result = await removeHoliday(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setHolidays((prev) => prev.filter((h) => h.id !== id));
    toast.success("삭제되었습니다");
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const result = await importKoreanHolidays(year);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`${year}년 공휴일을 가져왔습니다`);
      const data = await getHolidays(year);
      setHolidays(data);
    } finally {
      setIsImporting(false);
    }
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) return;
    setSelectedDate(date);
    const dateStr = formatDateToISO(date);
    setNewDate(dateStr);
  }

  function formatDateToISO(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function formatDisplay(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <CalendarOff className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">공휴일 관리</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleImport}
          disabled={isImporting}
        >
          {isImporting ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1 h-4 w-4" />
          )}
          {year}년 공휴일 가져오기
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Calendar + Add Form */}
        <Card>
          <CardContent className="space-y-4 pt-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleCalendarSelect}
              defaultMonth={new Date(year, 0)}
              onMonthChange={(month) => {
                const newYear = month.getFullYear();
                if (newYear !== year) loadYear(newYear);
              }}
              className="w-full p-0"
              classNames={{
                root: "w-full",
                day: "flex-1",
                weekday: "flex-1",
              }}
              modifiers={{
                holiday: holidays.map(
                  (h) => new Date(h.holiday_date + "T00:00:00")
                ),
              }}
              modifiersClassNames={{
                holiday:
                  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
              }}
            />

            <Separator />

            <div className="space-y-3">
              <Label>공휴일 추가</Label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="공휴일 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={isAdding}
                >
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                캘린더에서 날짜를 클릭하면 자동으로 입력됩니다
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Holiday List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {year}년 공휴일 목록 ({holidays.length}일)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {holidays.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                등록된 공휴일이 없습니다
              </p>
            ) : (
              <div className="space-y-1">
                {holidays.map((holiday) => (
                  <div
                    key={holiday.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        {formatDisplay(holiday.holiday_date)}
                      </span>
                      <span className="font-medium">{holiday.name}</span>
                      {holiday.source === "api" && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                          자동
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(holiday.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
