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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import {
  CalendarDays,
  Plus,
  Trash2,
  Loader2,
  UtensilsCrossed,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateISO } from "@/lib/utils";
import type { Menu, DailyMenu } from "@/types";
import {
  getDailyMenusByDate,
  assignMenuToDate,
  removeMenuFromDate,
} from "@/lib/actions/menu";

function isWeekday(date: Date): boolean {
  const dow = date.getDay();
  return dow >= 1 && dow <= 5;
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

export function AssignmentManagement({ menus }: { menus: Menu[] }) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [assignments, setAssignments] = useState<DailyMenu[]>([]);
  const [selectedMenuId, setSelectedMenuId] = useState<string>("");
  const [slotType, setSlotType] = useState<"main" | "optional">("main");
  const [isAssigning, setIsAssigning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const dateStr = selectedDate ? formatDateISO(selectedDate) : "";

  const loadAssignments = useCallback(async (date: string) => {
    setIsLoading(true);
    try {
      const data = await getDailyMenusByDate(date);
      setAssignments(data);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dateStr) {
      loadAssignments(dateStr);
    } else {
      setAssignments([]);
    }
  }, [dateStr, loadAssignments]);

  const assignedMenuIds = new Set(assignments.map((a) => a.menu_id));
  const availableMenus = menus.filter((m) => !assignedMenuIds.has(m.id));

  async function handleAssign() {
    if (!dateStr || !selectedMenuId) {
      toast.error("날짜와 메뉴를 선택해주세요");
      return;
    }

    setIsAssigning(true);
    try {
      const result = await assignMenuToDate(dateStr, selectedMenuId, slotType);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("메뉴가 배정되었습니다");
      setSelectedMenuId("");
      await loadAssignments(dateStr);
    } finally {
      setIsAssigning(false);
    }
  }

  async function handleRemove(assignmentId: string) {
    const result = await removeMenuFromDate(assignmentId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("배정이 해제되었습니다");
    if (dateStr) await loadAssignments(dateStr);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/admin/menus" className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <CalendarDays className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">일일 메뉴 배정</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[auto_1fr]">
        <Card>
          <CardContent className="p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              weekStartsOn={1}
              disabled={(date) => !isWeekday(date)}
              classNames={{
                day_disabled: "opacity-30",
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedDate ? (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    {selectedDate.getFullYear()}년{" "}
                    {selectedDate.getMonth() + 1}월{" "}
                    {selectedDate.getDate()}일 (
                    {DAY_NAMES[selectedDate.getDay()]})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Select
                      value={selectedMenuId}
                      onValueChange={(val) => setSelectedMenuId(val ?? "")}
                    >
                      <SelectTrigger className="flex-1">
                        <span className="flex flex-1 text-left">{availableMenus.find((m) => m.id === selectedMenuId)?.title ?? "메뉴 선택..."}</span>
                      </SelectTrigger>
                      <SelectContent>
                        {availableMenus.length === 0 ? (
                          <SelectItem value="_none" disabled>
                            배정 가능한 메뉴 없음
                          </SelectItem>
                        ) : (
                          availableMenus.map((menu) => (
                            <SelectItem key={menu.id} value={menu.id}>
                              {menu.title}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>

                    <Select
                      value={slotType}
                      onValueChange={(v) =>
                        setSlotType((v ?? "main") as "main" | "optional")
                      }
                    >
                      <SelectTrigger className="w-28">
                        <span className="flex flex-1 text-left">{slotType === "main" ? "메인" : "선택"}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="main">메인</SelectItem>
                        <SelectItem value="optional">선택</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      onClick={handleAssign}
                      disabled={isAssigning || !selectedMenuId}
                      size="sm"
                    >
                      {isAssigning ? (
                        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-1.5 h-4 w-4" />
                      )}
                      배정
                    </Button>
                  </div>

                  <Separator />

                  {isLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : assignments.length === 0 ? (
                    <div className="flex flex-col items-center py-6 text-muted-foreground">
                      <UtensilsCrossed className="mb-1 h-5 w-5" />
                      <p className="text-sm">배정된 메뉴가 없습니다</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {assignments.map((assignment) => (
                        <div
                          key={assignment.id}
                          className="flex items-center gap-3 rounded-lg border p-3"
                        >
                          {assignment.menu?.image_url && (
                            <img
                              src={assignment.menu.image_url}
                              alt={assignment.menu?.title ?? ""}
                              className="h-12 w-12 rounded-md object-cover"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {assignment.menu?.title ?? "Unknown"}
                            </p>
                            <div className="mt-0.5 flex gap-1">
                              <Badge
                                variant={
                                  assignment.slot_type === "main"
                                    ? "default"
                                    : "secondary"
                                }
                                className="text-[10px]"
                              >
                                {assignment.slot_type === "main"
                                  ? "메인"
                                  : "선택"}
                              </Badge>
                              {assignment.menu?.dietary_tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px]"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleRemove(assignment.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <CalendarDays className="mb-2 h-8 w-8" />
                <p className="text-sm">날짜를 선택해주세요</p>
                <p className="text-xs">
                  캘린더에서 평일(월~금)을 선택하면 메뉴를 배정할 수 있습니다
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
