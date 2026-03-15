"use client";

import { useState, useCallback, useEffect } from "react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Check,
  Undo2,
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
import type { Pickup, MenuSelection, Review } from "@/types";
import { confirmPickup, undoPickup, getMyPickups } from "@/lib/actions/pickup";
import { createReview, getMyReviews } from "@/lib/actions/review";
import { handleActionError } from "@/lib/handle-action-error";

function isPast(dateStr: string): boolean {
  return dateStr <= getTodayStr();
}

interface PickupViewProps {
  pickups: Pickup[];
  selections: MenuSelection[];
  deliveryStart: string;
  deliveryEnd: string;
}

export function PickupView({
  pickups: initialPickups,
  selections,
  deliveryStart,
  deliveryEnd,
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

  const router = useRouter();
  const todayStr = getTodayStr();

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

  const deliveryDates = selections
    .map((s) => ({
      date: s.delivery_date,
      menuId: (s.daily_menu_assignment as any)?.menu?.id ?? "",
      menuTitle: (s.daily_menu_assignment as any)?.menu?.title ?? "메뉴",
      menuImage: (s.daily_menu_assignment as any)?.menu?.image_url ?? null,
      sauce: (s.daily_menu_assignment as any)?.menu?.sauce ?? "",
    }))
    .filter((d) => d.date && d.menuId)
    .sort((a, b) => b.date.localeCompare(a.date));

  const pickupMap = new Map(pickups.map((p) => [p.pickup_date, p]));

  const refreshPickups = useCallback(async () => {
    const data = await getMyPickups(deliveryStart, deliveryEnd);
    setPickups(data);
  }, [deliveryStart, deliveryEnd]);

  async function handleConfirm(dateStr: string) {
    setConfirmingDate(dateStr);
    try {
      const result = await confirmPickup(dateStr);
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
    setConfirmingDate(dateStr);
    try {
      const result = await undoPickup(dateStr);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("취소되었습니다");
      await refreshPickups();
    } finally {
      setConfirmingDate(null);
    }
  }

  function openReviewDialog(menuId: string, menuTitle: string, pickupDate: string) {
    const existing = getReviewForDate(menuId, pickupDate);
    if (existing) {
      setReviewRating(existing.rating);
      setReviewComment(existing.comment);
      setReviewImage(existing.image_url);
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
      const result = await createReview(
        reviewDialog.menuId,
        reviewDialog.pickupDate,
        reviewRating,
        reviewComment,
        reviewImage
      );
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("리뷰가 등록되었습니다");
      const refreshed = await getMyReviews();
      setMyReviews(refreshed);
      setReviewDialog({ open: false, menuId: "", menuTitle: "", pickupDate: "", existingReview: null });
    } finally {
      setIsSubmittingReview(false);
    }
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

      {deliveryDates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <UtensilsCrossed className="mb-2 h-8 w-8" />
            <p className="text-sm">선택한 메뉴가 없습니다</p>
            <p className="text-sm">먼저 메뉴를 선택해주세요</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deliveryDates.map((item) => {
            const pickup = pickupMap.get(item.date);
            const isConfirmed = pickup?.confirmed === true;
            const isToday = item.date === todayStr;
            const canConfirm = isPast(item.date);
            const isLoading = confirmingDate === item.date;

            return (
              <Card
                key={item.date}
                className={
                  isConfirmed
                    ? "border-green-500/30 bg-green-50/30 dark:bg-green-900/10"
                    : isToday
                      ? "border-primary/30 bg-primary/5"
                      : ""
                }
              >
                <CardContent className="flex items-center gap-3 py-3">
                  {item.menuImage ? (
                    <Link href={`/menu/${item.menuId}`} className="flex-shrink-0">
                      <img
                        src={item.menuImage}
                        alt={item.menuTitle}
                        className="h-14 w-14 rounded-lg object-cover"
                      />
                    </Link>
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

                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    {isConfirmed ? (
                      <>
                        {(() => {
                          const hasReview = !!getReviewForDate(item.menuId, item.date);
                          return (
                            <Button
                              size="sm"
                              variant="ghost"
                              className={`h-8 text-sm ${hasReview ? "text-yellow-500" : "text-muted-foreground"}`}
                              onClick={() =>
                                openReviewDialog(
                                  item.menuId,
                                  item.menuTitle,
                                  item.date
                                )
                              }
                            >
                              <Star className={`mr-1 h-3.5 w-3.5 ${hasReview ? "fill-yellow-400" : ""}`} />
                              {hasReview ? "리뷰 보기" : "리뷰"}
                            </Button>
                          );
                        })()}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => handleUndo(item.date)}
                          disabled={isLoading}
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    ) : canConfirm ? (
                      <Button
                        size="sm"
                        className="h-8 text-sm"
                        onClick={() => handleConfirm(item.date)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="mr-1 h-3.5 w-3.5" />
                        )}
                        챙겼어요
                      </Button>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-xs text-muted-foreground"
                      >
                        예정
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={reviewDialog.open}
        onOpenChange={(open) =>
          setReviewDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewDialog.existingReview ? "내 리뷰" : "리뷰 작성"}
            </DialogTitle>
          </DialogHeader>

          {reviewDialog.existingReview ? (
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

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  onClick={() =>
                    setReviewDialog((prev) => ({ ...prev, open: false }))
                  }
                >
                  닫기
                </Button>
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
                  onClick={() =>
                    setReviewDialog((prev) => ({ ...prev, open: false }))
                  }
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
                  리뷰 등록
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
