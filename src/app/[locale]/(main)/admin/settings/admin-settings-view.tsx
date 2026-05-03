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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  deleteWeeklyMenuDeadline,
  getWeeklyMenuDeadlines,
  updateAdminSetting,
  upsertWeeklyMenuDeadline,
  type WeeklyMenuDeadline,
} from "@/lib/actions/admin";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Settings, Clock, Trash2, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateISO, getKSTDate } from "@/lib/utils";

const DAY_OPTIONS = [
  { value: "1", label: "월요일" },
  { value: "2", label: "화요일" },
  { value: "3", label: "수요일" },
  { value: "4", label: "목요일" },
  { value: "5", label: "금요일" },
  { value: "6", label: "토요일" },
  { value: "7", label: "일요일" },
];

function getMondayISO(date: Date): string {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - diff);
  return formatDateISO(d);
}

function addDaysISO(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return formatDateISO(d);
}

function getUpcomingWeekOptions(count = 12) {
  const today = getKSTDate();
  let weekStart = getMondayISO(today);
  const labels = ["첫째", "둘째", "셋째", "넷째", "다섯째", "여섯째"];
  return Array.from({ length: count }, (_, idx) => {
    const current = addDaysISO(weekStart, idx * 7);
    const monday = new Date(current + "T00:00:00");
    const monthStart = new Date(monday.getFullYear(), monday.getMonth(), 1);
    const firstMonday = new Date(monthStart);
    const firstDow = firstMonday.getDay();
    firstMonday.setDate(
      monthStart.getDate() - (firstDow === 0 ? 6 : firstDow - 1)
    );
    const weekIndex =
      Math.floor((monday.getTime() - firstMonday.getTime()) / (7 * 86400000)) +
      1;
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    return {
      value: current,
      label: `${monday.getMonth() + 1}월 ${labels[weekIndex - 1] ?? `${weekIndex}번째`}주 (${monday.getDate()}~${friday.getDate()}일)`,
    };
  });
}

interface AdminSettingsViewProps {
  initialCutoffDay: number;
  initialCutoffTime: string;
  initialWeeklyDeadlines: WeeklyMenuDeadline[];
}

export function AdminSettingsView({
  initialCutoffDay,
  initialCutoffTime,
  initialWeeklyDeadlines,
}: AdminSettingsViewProps) {
  const [cutoffDay, setCutoffDay] = useState(String(initialCutoffDay));
  const [cutoffTime, setCutoffTime] = useState(initialCutoffTime);
  const [weeklyDeadlines, setWeeklyDeadlines] = useState(initialWeeklyDeadlines);
  const [weekStart, setWeekStart] = useState("");
  const [deadlineDate, setDeadlineDate] = useState("");
  const [deadlineTime, setDeadlineTime] = useState("23:59");
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);

  const hasChanges =
    cutoffDay !== String(initialCutoffDay) || cutoffTime !== initialCutoffTime;

  async function handleSave() {
    setIsSaving(true);

    const dayResult = await updateAdminSetting(
      "menu_selection_cutoff_day",
      cutoffDay
    );
    if (dayResult.error) {
      toast.error(dayResult.error);
      setIsSaving(false);
      return;
    }

    const timeResult = await updateAdminSetting(
      "menu_selection_cutoff_time",
      cutoffTime
    );
    if (timeResult.error) {
      toast.error(timeResult.error);
      setIsSaving(false);
      return;
    }

    toast.success("설정이 저장되었습니다");
    setIsSaving(false);
  }

  async function reloadWeeklyDeadlines() {
    const today = getKSTDate();
    const end = new Date(today);
    end.setDate(end.getDate() + 120);
    setWeeklyDeadlines(
      await getWeeklyMenuDeadlines(formatDateISO(today), formatDateISO(end))
    );
  }

  async function handleSaveWeeklyDeadline() {
    if (!weekStart || !deadlineDate || !deadlineTime) {
      toast.error("배달 주 시작일, 마감 날짜, 마감 시간을 모두 입력해주세요");
      return;
    }
    setIsSavingWeekly(true);
    try {
      const result = await upsertWeeklyMenuDeadline(
        weekStart,
        deadlineDate,
        deadlineTime
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("주차별 마감일이 저장되었습니다");
      setWeekStart("");
      setDeadlineDate("");
      await reloadWeeklyDeadlines();
    } finally {
      setIsSavingWeekly(false);
    }
  }

  async function handleDeleteWeeklyDeadline(id: string) {
    const result = await deleteWeeklyMenuDeadline(id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setWeeklyDeadlines((prev) => prev.filter((d) => d.id !== id));
    toast.success("주차별 마감일이 삭제되었습니다");
  }

  const dayLabel =
    DAY_OPTIONS.find((d) => d.value === cutoffDay)?.label ?? "목요일";
  const weekOptions = getUpcomingWeekOptions();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon-sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">마감일 관리</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            메뉴 선택 마감 설정
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            이번 주 메뉴 선택을 마감하는 기준 시점을 설정합니다. 설정한 요일과
            시간이 지나면 해당 주의 메뉴를 변경할 수 없습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>마감 요일</Label>
              <Select value={cutoffDay} onValueChange={(v) => v && setCutoffDay(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>마감 시간</Label>
              <Input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3">
            <div className="flex items-start gap-2">
              <Settings className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                현재 설정: 매주 <strong className="text-foreground">{dayLabel} {cutoffTime}</strong>까지
                다음 주 메뉴를 선택할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              저장
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            주차별 마감일 설정
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            특정 배달 주는 이전 주 요일 규칙 대신 정확한 날짜와 시간으로 마감할 수 있습니다.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>배달 주차</Label>
              <Select value={weekStart} onValueChange={(v) => v && setWeekStart(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="주차 선택" />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>마감 날짜</Label>
              <Input
                type="date"
                value={deadlineDate}
                onChange={(e) => setDeadlineDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>마감 시간</Label>
              <Input
                type="time"
                value={deadlineTime}
                onChange={(e) => setDeadlineTime(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveWeeklyDeadline} disabled={isSavingWeekly}>
              {isSavingWeekly ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              주차별 마감 저장
            </Button>
          </div>

          <div className="space-y-1 rounded-lg border p-2">
            {weeklyDeadlines.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                등록된 주차별 마감일이 없습니다
              </p>
            ) : (
              weeklyDeadlines.map((deadline) => (
                <div
                  key={deadline.id}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-muted/50"
                >
                  <div>
                    <span className="font-medium">
                      {deadline.week_start} 주
                    </span>
                    <span className="ml-2 text-muted-foreground">
                      {new Date(deadline.deadline_at).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZone: "Asia/Seoul",
                      })} 마감
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteWeeklyDeadline(deadline.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
