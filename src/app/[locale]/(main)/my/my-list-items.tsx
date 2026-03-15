"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Star,
  UtensilsCrossed,
  Trash2,
  X,
  ThumbsUp,
  MessageCircle,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatDateCompact } from "@/lib/utils";
import type { MenuFavorite, Review, Post } from "@/types";

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
