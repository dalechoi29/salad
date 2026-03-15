"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  ArrowLeft,
  Heart,
  UtensilsCrossed,
  Flame,
  Drumstick,
  Star,
  MessageSquare,
  Pencil,
  Trash2,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { toggleFavorite, getMyFavorites } from "@/lib/actions/menu";
import { handleActionError } from "@/lib/handle-action-error";
import { getReviewsForMenu, deleteReview } from "@/lib/actions/review";
import { useUser } from "@/components/providers/user-provider";
import { ReviewEditDialog } from "@/components/shared/review-edit-dialog";
import type { Menu, Review } from "@/types";

const DIETARY_LABELS: Record<string, string> = {
  vegan: "비건",
  gluten_free: "글루텐프리",
  nut_free: "견과류 없음",
  dairy_free: "유제품 없음",
  low_carb: "저탄수화물",
  high_protein: "고단백",
};

const CATEGORY_LABELS: Record<string, string> = {
  salad: "샐러드",
  sandwich: "샌드위치",
  bowl: "보울",
};

export function MenuDetail({ menu }: { menu: Menu }) {
  const router = useRouter();
  const { user } = useUser();
  const [isFav, setIsFav] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [editingReview, setEditingReview] = useState<Review | null>(null);

  useEffect(() => {
    async function loadData() {
      const [favs, revs] = await Promise.all([
        getMyFavorites(),
        getReviewsForMenu(menu.id),
      ]);
      setIsFav(favs.some((f) => f.menu_id === menu.id));
      setReviews(revs);
    }
    loadData();
  }, [menu.id]);

  async function handleToggleFavorite() {
    const result = await toggleFavorite(menu.id);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setIsFav(result.favorited ?? false);
    toast.success(result.favorited ? "즐겨찾기에 추가됨" : "즐겨찾기 해제됨");
  }

  async function handleDeleteReview(reviewId: string) {
    const result = await deleteReview(reviewId);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    toast.success("리뷰가 삭제되었습니다");
  }

  function handleReviewUpdated(updated: Review) {
    setReviews((prev) =>
      prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">메뉴 상세</h1>
      </div>

      {menu.image_url ? (
        <img
          src={menu.image_url}
          alt={menu.title}
          className="aspect-[4/3] w-full rounded-xl object-cover"
        />
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-muted">
          <UtensilsCrossed className="h-12 w-12 text-muted-foreground" />
        </div>
      )}

      <div className="mt-4 space-y-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm">
                {CATEGORY_LABELS[menu.category] ?? menu.category}
              </Badge>
              {menu.is_main && (
                <Badge variant="outline" className="text-sm">
                  메인
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold">{menu.title}</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={handleToggleFavorite}
          >
            <Heart
              className={`h-5 w-5 ${
                isFav
                  ? "fill-red-500 text-red-500"
                  : "text-muted-foreground"
              }`}
            />
          </Button>
        </div>

        {(menu.sauce || menu.protein != null || menu.kcal != null) && (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {menu.sauce && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <span className="text-base">🥣</span>
                  <span>{menu.sauce}</span>
                </div>
              )}
              {menu.protein != null && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Drumstick className="h-4 w-4" />
                  <span>단백질 {menu.protein}g</span>
                </div>
              )}
              {menu.kcal != null && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Flame className="h-4 w-4" />
                  <span>{menu.kcal}kcal</span>
                </div>
              )}
            </div>
            <Separator />
          </>
        )}

        {menu.description && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold">상세 설명</h3>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {menu.description}
            </p>
          </div>
        )}

        {menu.dietary_tags.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1.5">
              <h3 className="text-sm font-semibold">식단 정보</h3>
              <div className="flex flex-wrap gap-2">
                {menu.dietary_tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-sm">
                    {DIETARY_LABELS[tag] ?? tag}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <h3 className="text-sm font-semibold">
              리뷰 ({reviews.length})
            </h3>
            {reviews.length > 0 && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                {(
                  reviews.reduce((sum, r) => sum + r.rating, 0) /
                  reviews.length
                ).toFixed(1)}
              </div>
            )}
          </div>

          {reviews.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              아직 리뷰가 없습니다
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((review) => {
                const isOwn = user?.id === review.user_id;
                return (
                  <div
                    key={review.id}
                    className="space-y-1.5 rounded-lg border p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {review.profile?.nickname ?? "익명"}
                        </span>
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={`h-3 w-3 ${
                                n <= review.rating
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "text-muted-foreground/20"
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isOwn && (
                          <>
                            <button
                              onClick={() => setEditingReview(review)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteReview(review.id)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                        <span className="ml-1 text-xs text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                    </div>
                    {review.comment && (
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        {review.comment}
                      </p>
                    )}
                    {review.image_url && (
                      <img
                        src={review.image_url}
                        alt="Review"
                        className="h-32 w-full rounded-md object-cover"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ReviewEditDialog
        review={editingReview}
        open={!!editingReview}
        onOpenChange={(open) => {
          if (!open) setEditingReview(null);
        }}
        onUpdated={handleReviewUpdated}
      />
    </div>
  );
}
