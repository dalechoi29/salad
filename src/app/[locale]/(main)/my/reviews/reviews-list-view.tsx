"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Star } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deleteReview } from "@/lib/actions/review";
import { handleActionError } from "@/lib/handle-action-error";
import { toast } from "sonner";
import { ReviewEditDialog } from "@/components/shared/review-edit-dialog";
import { ReviewItem } from "../my-list-items";
import type { Review } from "@/types";

export function ReviewsListView({
  initialReviews,
}: {
  initialReviews: Review[];
}) {
  const router = useRouter();
  const [reviews, setReviews] = useState(initialReviews);
  const [editingReview, setEditingReview] = useState<Review | null>(null);

  async function handleDelete(reviewId: string) {
    const result = await deleteReview(reviewId);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    toast.success("리뷰가 삭제되었습니다");
  }

  function handleUpdated(updated: Review) {
    setReviews((prev) =>
      prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <Star className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">내 리뷰</h1>
      </div>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">작성한 리뷰가 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews.map((review) => (
            <ReviewItem
              key={review.id}
              review={review}
              onEdit={setEditingReview}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <ReviewEditDialog
        review={editingReview}
        open={!!editingReview}
        onOpenChange={(open) => {
          if (!open) setEditingReview(null);
        }}
        onUpdated={handleUpdated}
      />
    </div>
  );
}
