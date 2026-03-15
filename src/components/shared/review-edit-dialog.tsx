"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateReview } from "@/lib/actions/review";
import { handleActionError } from "@/lib/handle-action-error";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import type { Review } from "@/types";

interface ReviewEditDialogProps {
  review: Review | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: (updated: Review) => void;
}

export function ReviewEditDialog({
  review,
  open,
  onOpenChange,
  onUpdated,
}: ReviewEditDialogProps) {
  const router = useRouter();
  const [rating, setRating] = useState(review?.rating ?? 5);
  const [comment, setComment] = useState(review?.comment ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(
    review?.image_url ?? null
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (review && open) {
      setRating(review.rating);
      setComment(review.comment);
      setImageUrl(review.image_url);
    }
  }, [review, open]);

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

      setImageUrl(urlData.publicUrl);
    } catch {
      toast.error("이미지 업로드 중 오류가 발생했습니다");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSave() {
    if (!review) return;
    setIsSaving(true);
    try {
      const result = await updateReview(review.id, rating, comment, imageUrl);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      toast.success("리뷰가 수정되었습니다");
      onUpdated({
        ...review,
        rating,
        comment: comment.trim(),
        image_url: imageUrl,
        updated_at: new Date().toISOString(),
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>리뷰 수정</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>평점</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className="rounded p-0.5 transition-colors hover:bg-accent"
                >
                  <Star
                    className={`h-7 w-7 ${
                      n <= rating
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
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="맛, 양, 신선도 등 자유롭게 작성해주세요"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>사진 (선택)</Label>
            {imageUrl ? (
              <div className="relative">
                <img
                  src={imageUrl}
                  alt="Review"
                  className="h-32 w-full rounded-lg border object-cover"
                />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute right-2 top-2 h-6 w-6"
                  onClick={() => setImageUrl(null)}
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
                    <span className="text-[10px]">사진 추가</span>
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              수정 완료
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
