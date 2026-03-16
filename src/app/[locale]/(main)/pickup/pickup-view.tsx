"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Star,
  Loader2,
  UtensilsCrossed,
  ImagePlus,
  X,
  Package,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDateShort, getTodayStr } from "@/lib/utils";
import type { Pickup, MenuSelection, Review, DailyMenu } from "@/types";
import { confirmPickup, undoPickup, getMyPickups } from "@/lib/actions/pickup";
import { createReview, updateReview, deleteReview, getMyReviews } from "@/lib/actions/review";
import { handleActionError } from "@/lib/handle-action-error";

const PAGE_SIZE = 15;

function isPast(dateStr: string): boolean {
  return dateStr <= getTodayStr();
}

interface PickupViewProps {
  pickups: Pickup[];
  selections: MenuSelection[];
  deliveryStart: string;
  deliveryEnd: string;
  todayMenus: DailyMenu[];
  todayStr: string;
}

export function PickupView({
  pickups: initialPickups,
  selections,
  deliveryStart,
  deliveryEnd,
  todayMenus,
  todayStr: serverTodayStr,
}: PickupViewProps) {
  const [pickups, setPickups] = useState(initialPickups);
  const [confirmingDate, setConfirmingDate] = useState<string | null>(null);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [reviewDialog, setReviewDialog] = useState<{
    open: boolean;
    menuId: string;
    menuTitle: string;
    pickupDate: string;
    existingReview: Review | null;
  }>({ open: false, menuId: "", menuTitle: "", pickupDate: "", existingReview: null });
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [isDeletingReview, setIsDeletingReview] = useState(false);
  const [undoingDate, setUndoingDate] = useState<string | null>(null);

  const router = useRouter();
  const todayStr = getTodayStr();
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadReviews() {
      const reviews = await getMyReviews();
      setMyReviews(reviews);
    }
    loadReviews();
  }, []);

  function getReviewForDate(menuId: string, pickupDate: string): Review | null {
    return myReviews.find(
      (r) => r.menu_id === menuId && r.pickup_date === pickupDate
    ) ?? null;
  }

  type DeliveryItem = {
    date: string;
    menuId: string;
    menuTitle: string;
    menuImage: string | null;
    sauce: string;
    unselected?: boolean;
    availableMenus?: DailyMenu[];
  };

  const allDeliveryDates = useMemo(() => {
    const dateSet = new Set<string>();
    const items: DeliveryItem[] = [];

    for (const s of selections) {
      const menu = (s.daily_menu_assignment as any)?.menu;
      if (!s.delivery_date || !menu?.id) continue;
      dateSet.add(s.delivery_date);
      items.push({
        date: s.delivery_date,
        menuId: menu.id,
        menuTitle: menu.title ?? "메뉴",
        menuImage: menu.image_url ?? null,
        sauce: menu.sauce ?? "",
      });
    }

    if (todayMenus.length > 0 && !dateSet.has(serverTodayStr)) {
      const todayPickup = pickups.find(
        (p) => p.pickup_date === serverTodayStr && p.confirmed && p.menu_id
      );
      if (todayPickup?.menu_id) {
        const matchedMenu = todayMenus.find(
          (dm) => dm.menu?.id === todayPickup.menu_id
        );
        items.push({
          date: serverTodayStr,
          menuId: todayPickup.menu_id,
          menuTitle: matchedMenu?.menu?.title ?? "메뉴",
          menuImage: matchedMenu?.menu?.image_url ?? null,
          sauce: matchedMenu?.menu?.sauce ?? "",
        });
      } else {
        items.push({
          date: serverTodayStr,
          menuId: "",
          menuTitle: "메뉴를 선택해주세요",
          menuImage: null,
          sauce: "",
          unselected: true,
          availableMenus: todayMenus,
        });
      }
    }

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [selections, todayMenus, serverTodayStr, pickups]);

  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>();
    for (const d of allDeliveryDates) {
      const [y, m] = d.date.split("-");
      monthSet.add(`${y}-${m}`);
    }
    return Array.from(monthSet).sort();
  }, [allDeliveryDates]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  useEffect(() => {
    if (availableMonths.length > 0) {
      const match = availableMonths.includes(currentMonth)
        ? currentMonth
        : availableMonths[availableMonths.length - 1];
      setSelectedMonth(match);
    }
  }, [availableMonths, currentMonth]);

  const filteredDates = useMemo(
    () =>
      selectedMonth
        ? allDeliveryDates.filter((d) => d.date.startsWith(selectedMonth))
        : allDeliveryDates,
    [allDeliveryDates, selectedMonth]
  );

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [selectedMonth]);

  const visibleDates = filteredDates.slice(0, displayCount);
  const hasMore = displayCount < filteredDates.length;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setDisplayCount((prev) => prev + PAGE_SIZE);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, selectedMonth]);

  const pickupMap = new Map(pickups.map((p) => [p.pickup_date, p]));

  const refreshPickups = useCallback(async () => {
    const data = await getMyPickups(deliveryStart, deliveryEnd);
    setPickups(data);
  }, [deliveryStart, deliveryEnd]);

  async function doConfirm(dateStr: string, menuId?: string) {
    setConfirmingDate(dateStr);
    try {
      const result = await confirmPickup(dateStr, menuId);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("챙겼어요!");
      await refreshPickups();
    } finally {
      setConfirmingDate(null);
    }
  }

  async function handleUndo(dateStr: string) {
    setUndoingDate(dateStr);
    try {
      const result = await undoPickup(dateStr);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("픽업이 취소되었습니다");
      await refreshPickups();
    } finally {
      setUndoingDate(null);
    }
  }

  function openReviewDialog(menuId: string, menuTitle: string, pickupDate: string) {
    const existing = getReviewForDate(menuId, pickupDate);
    if (existing) {
      setReviewRating(existing.rating);
      setReviewComment(existing.comment);
      setReviewImage(existing.image_url);
      setIsEditingReview(false);
    } else {
      setReviewRating(5);
      setReviewComment("");
      setReviewImage(null);
    }
    setReviewDialog({ open: true, menuId, menuTitle, pickupDate, existingReview: existing });
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
        .from("review-images")
        .upload(fileName, file, { contentType: file.type });

      if (error) {
        toast.error(`업로드 실패: ${error.message}`);
        return;
      }

      const { data: urlData } = supabase.storage
        .from("review-images")
        .getPublicUrl(fileName);

      setReviewImage(urlData.publicUrl);
    } catch {
      toast.error("이미지 업로드 중 오류가 발생했습니다");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubmitReview() {
    setIsSubmittingReview(true);
    try {
      const existing = reviewDialog.existingReview;
      let result;
      if (existing && isEditingReview) {
        result = await updateReview(existing.id, reviewRating, reviewComment, reviewImage);
      } else {
        result = await createReview(
          reviewDialog.menuId,
          reviewDialog.pickupDate,
          reviewRating,
          reviewComment,
          reviewImage
        );
      }
      if (result.error) {
        if (result.error.includes("duplicate key") || result.error.includes("unique constraint")) {
          toast.error("리뷰를 작성한 메뉴에요");
          const refreshed = await getMyReviews();
          setMyReviews(refreshed);
          setReviewDialog((prev) => ({ ...prev, open: false }));
          return;
        }
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success(isEditingReview ? "리뷰가 수정되었습니다" : "리뷰가 등록되었습니다");
      const refreshed = await getMyReviews();
      setMyReviews(refreshed);
      setIsEditingReview(false);
      setReviewDialog({ open: false, menuId: "", menuTitle: "", pickupDate: "", existingReview: null });
    } finally {
      setIsSubmittingReview(false);
    }
  }

  async function handleDeleteReview() {
    const existing = reviewDialog.existingReview;
    if (!existing) return;
    setIsDeletingReview(true);
    try {
      const result = await deleteReview(existing.id);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("리뷰가 삭제되었습니다");
      const refreshed = await getMyReviews();
      setMyReviews(refreshed);
      setReviewDialog({ open: false, menuId: "", menuTitle: "", pickupDate: "", existingReview: null });
    } finally {
      setIsDeletingReview(false);
    }
  }

  function startEditReview() {
    const existing = reviewDialog.existingReview;
    if (!existing) return;
    setReviewRating(existing.rating);
    setReviewComment(existing.comment);
    setReviewImage(existing.image_url);
    setIsEditingReview(true);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">내 샐러드</h1>
        </div>
        <Link href="/menu">
          <Button size="sm">
            <UtensilsCrossed className="mr-1.5 h-4 w-4" />
            샐러드 고르기
          </Button>
        </Link>
      </div>

      {availableMonths.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {availableMonths.map((m) => {
            const [y, mo] = m.split("-");
            const label = `${parseInt(mo)}월`;
            const isActive = selectedMonth === m;
            return (
              <Button
                key={m}
                size="sm"
                variant={isActive ? "default" : "outline"}
                className="flex-shrink-0"
                onClick={() => setSelectedMonth(m)}
              >
                {label}
              </Button>
            );
          })}
        </div>
      )}

      {filteredDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UtensilsCrossed className="mb-2 h-8 w-8" />
            <p className="text-sm">선택한 메뉴가 없습니다</p>
            <p className="text-sm">먼저 메뉴를 선택해주세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleDates.map((item) => {
            const pickup = pickupMap.get(item.date);
            const isConfirmed = pickup?.confirmed === true;
            const isToday = item.date === todayStr;
            const canConfirm = isPast(item.date);
            const isLoading = confirmingDate === item.date;
            const hasReview = !!getReviewForDate(item.menuId, item.date);

            if (item.unselected && item.availableMenus) {
              return (
                <Card
                  key={item.date}
                  className="border-primary/30 bg-primary/5"
                >
                  <CardContent className="space-y-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatDateShort(item.date)}
                      </span>
                      {isToday && <Badge className="text-xs">오늘</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      어떤 메뉴 선택하셨어요?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.availableMenus.map((dm) => (
                        <Button
                          key={dm.id}
                          size="sm"
                          variant="outline"
                          className="h-8 text-sm"
                          disabled={isLoading}
                          onClick={() => doConfirm(item.date, dm.menu?.id)}
                        >
                          {isLoading && confirmingDate === item.date && (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          )}
                          {dm.menu?.title ?? "메뉴"}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            }

            return (
              <Card
                key={item.date}
                className={`cursor-pointer transition-colors active:bg-accent/50 ${
                  isConfirmed
                    ? "border-green-500/30 bg-green-50/30 dark:bg-green-900/10"
                    : isToday
                      ? "border-primary/30 bg-primary/5"
                      : ""
                }`}
                onClick={() => item.menuId && router.push(`/menu/${item.menuId}`)}
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {item.menuImage ? (
                    <div className="flex-shrink-0">
                      <img
                        src={item.menuImage}
                        alt={item.menuTitle}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                      <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {formatDateShort(item.date)}
                      </span>
                      {isToday && (
                        <Badge className="text-xs">오늘</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {item.menuTitle}
                      {item.sauce && ` | ${item.sauce}`}
                    </p>
                  </div>

                  <div
                    className="flex flex-shrink-0 items-center gap-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isConfirmed ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-sm text-muted-foreground"
                          onClick={() => handleUndo(item.date)}
                          disabled={undoingDate === item.date}
                        >
                          {undoingDate === item.date ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "픽업 취소"
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-8 px-3 text-sm ${hasReview ? "text-yellow-600 border-yellow-300 dark:text-yellow-400 dark:border-yellow-700" : ""}`}
                          onClick={() =>
                            openReviewDialog(
                              item.menuId,
                              item.menuTitle,
                              item.date
                            )
                          }
                        >
                          {hasReview ? "리뷰 보기" : "리뷰하기"}
                        </Button>
                      </>
                    ) : canConfirm ? (
                      isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-3 text-sm"
                          onClick={() => doConfirm(item.date)}
                        >
                          챙겼어요
                        </Button>
                      )
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        배송 예정
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {hasMore && <div ref={sentinelRef} className="h-1" />}
        </div>
      )}

      <Dialog
        open={reviewDialog.open}
        onOpenChange={(open) => {
          if (!open) setIsEditingReview(false);
          setReviewDialog((prev) => ({ ...prev, open }));
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog.existingReview
                ? isEditingReview ? "리뷰 수정" : "내 리뷰"
                : "리뷰 작성"}
            </DialogTitle>
          </DialogHeader>

          {reviewDialog.existingReview && !isEditingReview ? (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {reviewDialog.menuTitle} · {formatDateShort(reviewDialog.pickupDate)}
              </p>

              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-6 w-6 ${
                      n <= reviewDialog.existingReview!.rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
              </div>

              {reviewDialog.existingReview.comment && (
                <p className="whitespace-pre-line text-sm">
                  {reviewDialog.existingReview.comment}
                </p>
              )}

              {reviewDialog.existingReview.image_url && (
                <img
                  src={reviewDialog.existingReview.image_url}
                  alt="Review"
                  className="h-48 w-full rounded-lg border object-cover"
                />
              )}

              <p className="text-xs text-muted-foreground">
                {new Date(reviewDialog.existingReview.created_at).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}에 작성됨
              </p>

              <div className="flex justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={handleDeleteReview}
                  disabled={isDeletingReview}
                >
                  {isDeletingReview && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                  삭제
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setReviewDialog((prev) => ({ ...prev, open: false }))
                    }
                  >
                    닫기
                  </Button>
                  <Button
                    size="sm"
                    onClick={startEditReview}
                  >
                    수정
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <p className="text-sm text-muted-foreground">
                {reviewDialog.menuTitle} · {formatDateShort(reviewDialog.pickupDate)}
              </p>

              <div className="space-y-2">
                <Label>평점</Label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setReviewRating(n)}
                      className="rounded p-0.5 transition-colors hover:bg-accent"
                    >
                      <Star
                        className={`h-7 w-7 ${
                          n <= reviewRating
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>코멘트</Label>
                <Textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="맛, 양, 신선도 등 자유롭게 작성해주세요"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>사진 (선택)</Label>
                {reviewImage ? (
                  <div className="relative">
                    <img
                      src={reviewImage}
                      alt="Review"
                      className="h-32 w-full rounded-lg border object-cover"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute right-2 top-2 h-6 w-6"
                      onClick={() => setReviewImage(null)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <label className="flex h-24 cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 transition-colors hover:border-muted-foreground/50">
                    {isUploading ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <ImagePlus className="h-5 w-5" />
                        <span className="text-xs">사진 추가</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </label>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (isEditingReview) {
                      setIsEditingReview(false);
                    } else {
                      setReviewDialog((prev) => ({ ...prev, open: false }));
                    }
                  }}
                >
                  취소
                </Button>
                <Button
                  onClick={handleSubmitReview}
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview && (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  )}
                  {isEditingReview ? "수정 완료" : "리뷰 등록"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
