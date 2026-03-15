"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Star,
  UtensilsCrossed,
  Trash2,
  X,
  ThumbsUp,
  MessageCircle,
  Check,
  Clock,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateCompact } from "@/lib/utils";
import type { MenuFavorite, Review, Post } from "@/types";
import type { SubscriptionWithDetails } from "./page";

export function SubscriptionCard({ entry }: { entry: SubscriptionWithDetails }) {
  const { subscription, period, deliveryDayCount } = entry;
  const isPaid = subscription.payment_status === "completed";
  const totalSalads = deliveryDayCount * (subscription.salads_per_delivery ?? 1);

  const now = new Date();
  const isApplying =
    now >= new Date(period.apply_start) && now <= new Date(period.apply_end);
  const isPaying =
    now >= new Date(period.pay_start) && now <= new Date(period.pay_end);
  const isActionable = isApplying || isPaying;

  const targetMonthShort = period.target_month.replace(/^\d{4}년\s*/, "");

  let title = `${period.target_month} 구독`;
  if (isApplying) title = `${targetMonthShort} 구독 신청 기간`;
  else if (isPaying && !isPaid) title = "결제 기간";

  const formatPayStart = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일부터 결제 가능해요`;
  };

  const formatApplyEnd = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}월 ${d.getDate()}일까지 신청해주세요`;
  };

  let subtitle: string | null = null;
  if (isPaying && !isPaid) subtitle = "결제하고 '결제 완료'를 눌러주세요";
  else if (!isPaid && !isPaying) subtitle = formatPayStart(period.pay_start);
  else if (isApplying) subtitle = formatApplyEnd(period.apply_end);

  return (
    <Link href={`/subscription?period=${period.id}`} className="block">
      <Card className={`transition-colors hover:bg-accent/50 ${isActionable && !isPaid ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
        <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
            <UtensilsCrossed className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {subtitle && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {isPaid ? (
            <Badge
              variant="secondary"
              className="ml-auto gap-1 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
            >
              <Check className="h-3 w-3" />
              결제 완료
            </Badge>
          ) : (
            <Badge
              variant="secondary"
              className="ml-auto gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
            >
              <Clock className="h-3 w-3" />
              결제 대기
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>주 {subscription.frequency_per_week}회</span>
            <span>·</span>
            <span>배달당 {subscription.salads_per_delivery}개</span>
            <span>·</span>
            <span>월 {totalSalads}개</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function FavoriteItem({
  fav,
  onRemove,
  showSeparator = false,
}: {
  fav: MenuFavorite;
  onRemove?: (menuId: string) => void;
  showSeparator?: boolean;
}) {
  const menu = fav.menu as any;
  if (!menu) return null;

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href={`/menu/${menu.id}`} className="flex-shrink-0">
          {menu.image_url ? (
            <img
              src={menu.image_url}
              alt={menu.title}
              className="h-10 w-10 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
              <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </Link>
        <Link href={`/menu/${menu.id}`} className="min-w-0 flex-1">
          <p className="text-sm font-medium">{menu.title}</p>
          {menu.sauce && (
            <p className="text-sm text-muted-foreground">{menu.sauce}</p>
          )}
        </Link>
        {onRemove && (
          <button
            onClick={() => onRemove(menu.id)}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showSeparator && <Separator />}
    </div>
  );
}

export function ReviewItem({
  review,
  onEdit,
  onDelete,
}: {
  review: Review;
  onEdit?: (review: Review) => void;
  onDelete?: (reviewId: string) => void;
}) {
  const menu = review.menu;

  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-start gap-3">
          {menu?.image_url ? (
            <Link href={`/menu/${menu.id}`} className="flex-shrink-0">
              <img
                src={menu.image_url}
                alt={menu.title ?? ""}
                className="h-12 w-12 rounded-md object-cover"
              />
            </Link>
          ) : (
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-muted">
              <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{menu?.title ?? "메뉴"}</p>
              {(onEdit || onDelete) && (
                <div className="flex items-center gap-0.5">
                  {onEdit && (
                    <button
                      onClick={() => onEdit(review)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={() => onDelete(review.id)}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star
                  key={n}
                  className={`h-3.5 w-3.5 ${
                    n <= review.rating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-muted-foreground/30"
                  }`}
                />
              ))}
              <span className="ml-1 text-xs text-muted-foreground">
                {formatDateCompact(review.pickup_date)}
              </span>
            </div>
            {review.comment && (
              <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                {review.comment}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PostItem({
  post,
  onDelete,
}: {
  post: Post;
  onDelete?: (postId: string) => void;
}) {
  return (
    <Link href={`/community/${post.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{post.title}</p>
              <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {new Date(post.created_at).toLocaleDateString("ko-KR")}
                </span>
                <div className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3" />
                  {post.vote_count}
                </div>
                <div className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {post.comment_count ?? 0}
                </div>
              </div>
            </div>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(post.id);
                }}
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
