"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Loader2,
  ImageIcon,
  X,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  getTodaySaladSummary,
  getDailySaladStatus,
  updateDailySaladStatus,
  getDailySaladStatusHistory,
  getCompanyUsers,
} from "@/lib/actions/admin";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { formatDateISO, getKSTDate, formatDateShort } from "@/lib/utils";
import type { DailySaladStatus } from "@/types";

export function TodaySaladView() {
  const todayStr = formatDateISO(getKSTDate());
  const [summary, setSummary] = useState<{ menuTitle: string; count: number }[]>([]);
  const [status, setStatus] = useState<DailySaladStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [isChecked, setIsChecked] = useState(false);
  const [location, setLocation] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [helpers, setHelpers] = useState<string[]>([]);
  const [helperInput, setHelperInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [companyUsers, setCompanyUsers] = useState<{ id: string; realName: string }[]>([]);

  const now = getKSTDate();
  const [histYear, setHistYear] = useState(now.getFullYear());
  const [histMonth, setHistMonth] = useState(now.getMonth() + 1);
  const [history, setHistory] = useState<DailySaladStatus[]>([]);
  const [histLoading, setHistLoading] = useState(true);

  const suggestions = useMemo(() => {
    if (!helperInput.trim()) return [];
    const lower = helperInput.toLowerCase();
    return companyUsers
      .filter(
        (u) =>
          u.realName.toLowerCase().includes(lower) &&
          !helpers.includes(u.realName)
      )
      .slice(0, 5);
  }, [helperInput, companyUsers, helpers]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [summaryData, statusData, users] = await Promise.all([
        getTodaySaladSummary(),
        getDailySaladStatus(todayStr),
        getCompanyUsers(),
      ]);
      setSummary(summaryData);
      setStatus(statusData);
      setCompanyUsers(users);
      if (statusData) {
        setIsChecked(statusData.is_checked);
        setLocation(statusData.location ?? "");
        setPhotoUrl(statusData.photo_url);
        setHelpers(statusData.helpers ? statusData.helpers.split(", ") : []);
      }
      setIsLoading(false);
    }
    load();
  }, [todayStr]);

  useEffect(() => {
    async function loadHistory() {
      setHistLoading(true);
      const start = `${histYear}-${String(histMonth).padStart(2, "0")}-01`;
      const endMonth = histMonth === 12 ? 1 : histMonth + 1;
      const endYear = histMonth === 12 ? histYear + 1 : histYear;
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      const data = await getDailySaladStatusHistory(start, end);
      setHistory(data);
      setHistLoading(false);
    }
    loadHistory();
  }, [histYear, histMonth]);

  function addHelper(name: string) {
    if (!name.trim() || helpers.includes(name.trim())) return;
    setHelpers((prev) => [...prev, name.trim()]);
    setHelperInput("");
    setShowSuggestions(false);
  }

  function removeHelper(name: string) {
    setHelpers((prev) => prev.filter((h) => h !== name));
  }

  function prevMonth() {
    if (histMonth === 1) {
      setHistYear((y) => y - 1);
      setHistMonth(12);
    } else {
      setHistMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (histMonth === 12) {
      setHistYear((y) => y + 1);
      setHistMonth(1);
    } else {
      setHistMonth((m) => m + 1);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("파일 크기는 5MB 이하만 가능합니다");
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const fileName = `${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from("salad-location-images")
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (error) {
        toast.error("이미지 업로드 실패: " + error.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("salad-location-images")
        .getPublicUrl(fileName);

      setPhotoUrl(urlData.publicUrl);
      toast.success("이미지가 업로드되었습니다");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const result = await updateDailySaladStatus(
        todayStr,
        isChecked,
        location,
        photoUrl ?? undefined,
        helpers.length > 0 ? helpers.join(", ") : undefined
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("저장되었습니다");
      const refreshed = await getDailySaladStatusHistory(
        `${histYear}-${String(histMonth).padStart(2, "0")}-01`,
        `${histMonth === 12 ? histYear + 1 : histYear}-${String(histMonth === 12 ? 1 : histMonth + 1).padStart(2, "0")}-01`
      );
      setHistory(refreshed);
    } finally {
      setIsSaving(false);
    }
  }

  const totalSalads = summary.reduce((sum, m) => sum + m.count, 0);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <h1 className="text-xl font-bold">오늘의 샐러드</h1>
        <span className="text-sm text-muted-foreground">{todayStr}</span>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                주문 현황
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  총 {totalSalads}개
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  오늘 주문된 샐러드가 없습니다
                </p>
              ) : (
                <div className="space-y-2">
                  {summary.map((item) => (
                    <div
                      key={item.menuTitle}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <span className="text-sm font-medium">
                        {item.menuTitle}
                      </span>
                      <span className="text-sm font-semibold">
                        {item.count}개
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">냉장고 배치</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="fridge-check"
                  checked={isChecked}
                  onCheckedChange={(checked) =>
                    setIsChecked(checked === true)
                  }
                />
                <label
                  htmlFor="fridge-check"
                  className="text-sm font-medium leading-none"
                >
                  냉장고에 넣었어요
                </label>
              </div>

              {isChecked && (
                <div className="space-y-4 pl-7">
                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      넣어주신 분
                    </label>
                    {helpers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {helpers.map((name) => (
                          <Badge
                            key={name}
                            variant="secondary"
                            className="gap-1 pr-1"
                          >
                            {name}
                            <button
                              type="button"
                              onClick={() => removeHelper(name)}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="relative">
                      <Input
                        value={helperInput}
                        onChange={(e) => {
                          setHelperInput(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        onBlur={() =>
                          setTimeout(() => setShowSuggestions(false), 150)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addHelper(helperInput);
                          }
                        }}
                        placeholder="이름을 입력하세요"
                      />
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-10 mt-1 overflow-hidden rounded-md border bg-popover shadow-md">
                          {suggestions.map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className="flex w-full items-center px-3 py-2 text-sm hover:bg-accent"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => addHelper(user.realName)}
                            >
                              {user.realName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      샐러드 위치
                    </label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="큰 라운지 오른쪽 냉장고 위쪽과 한칸 아래"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm text-muted-foreground">
                      위치 사진
                    </label>
                    {photoUrl ? (
                      <div className="relative">
                        <img
                          src={photoUrl}
                          alt="샐러드 위치"
                          className="h-40 w-full rounded-lg border object-cover"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-1 top-1 h-7 w-7 rounded-full bg-background/80"
                          onClick={() => setPhotoUrl(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-muted-foreground hover:bg-muted/50">
                        {isUploading ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <>
                            <ImageIcon className="h-5 w-5" />
                            <span className="text-sm">사진 첨부</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                          disabled={isUploading}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                저장
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">입력 기록</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                {histYear}년 {histMonth}월
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {histLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : history.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              이번 달 기록이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((row) => (
                <div
                  key={row.id}
                  className="flex items-start gap-3 rounded-lg border px-3 py-2.5"
                >
                  <div className="flex-shrink-0 pt-0.5">
                    {row.is_checked ? (
                      <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/10">
                        <Check className="h-3 w-3 text-green-500" />
                      </div>
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/20" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatDateShort(row.status_date)}
                      </span>
                    </div>
                    {row.helpers && (
                      <p className="text-xs text-muted-foreground">
                        {row.helpers}
                      </p>
                    )}
                    {row.location && (
                      <p className="text-xs text-muted-foreground">
                        위치: {row.location}
                      </p>
                    )}
                  </div>
                  {row.photo_url && (
                    <img
                      src={row.photo_url}
                      alt="위치"
                      className="h-10 w-10 flex-shrink-0 rounded border object-cover"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
