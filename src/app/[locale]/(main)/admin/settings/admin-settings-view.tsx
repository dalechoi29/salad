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
import { updateAdminSetting } from "@/lib/actions/admin";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Settings, Clock } from "lucide-react";
import { Link } from "@/i18n/navigation";

const DAY_OPTIONS = [
  { value: "1", label: "월요일" },
  { value: "2", label: "화요일" },
  { value: "3", label: "수요일" },
  { value: "4", label: "목요일" },
  { value: "5", label: "금요일" },
  { value: "6", label: "토요일" },
  { value: "7", label: "일요일" },
];

interface AdminSettingsViewProps {
  initialCutoffDay: number;
  initialCutoffTime: string;
}

export function AdminSettingsView({
  initialCutoffDay,
  initialCutoffTime,
}: AdminSettingsViewProps) {
  const [cutoffDay, setCutoffDay] = useState(String(initialCutoffDay));
  const [cutoffTime, setCutoffTime] = useState(initialCutoffTime);
  const [isSaving, setIsSaving] = useState(false);

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

  const dayLabel =
    DAY_OPTIONS.find((d) => d.value === cutoffDay)?.label ?? "목요일";

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
    </div>
  );
}
