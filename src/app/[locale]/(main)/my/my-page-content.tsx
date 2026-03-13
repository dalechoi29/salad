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
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  User,
  Pencil,
  Star,
  Heart,
  Flame,
  LogOut,
  UtensilsCrossed,
  Check,
  Clock,
  Loader2,
  Trash2,
  X,
  MessageSquare,
  ThumbsUp,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Archive,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateNickname, logout } from "@/lib/actions/auth";
import { toggleFavorite } from "@/lib/actions/menu";
import { deleteReview } from "@/lib/actions/review";
import { deletePost } from "@/lib/actions/community";
import { ReviewEditDialog } from "@/components/shared/review-edit-dialog";
import { formatDateCompact } from "@/lib/utils";
import type { Profile, SubscriptionPeriod, Subscription, MenuFavorite, Review, Post } from "@/types";
import type { SubscriptionWithDetails } from "./page";

interface MyPageContentProps {
  profile: Profile | null;
  period: SubscriptionPeriod | null;
  activeSubscriptions: SubscriptionWithDetails[];
  archivedSubscriptions: SubscriptionWithDetails[];
  initialFavorites: MenuFavorite[];
  initialReviews: Review[];
  streak: number;
  initialPosts: Post[];
}

function SubscriptionCard({ entry }: { entry: SubscriptionWithDetails }) {
  const { subscription, period, deliveryDayCount } = entry;
  const isPaid = subscription.payment_status === "completed";
  const totalSalads = deliveryDayCount * (subscription.salads_per_delivery ?? 1);

  const now = new Date();
  const isApplying =
    now >= new Date(period.apply_start) && now <= new Date(period.apply_end);
  const isPaying =
    now >= new Date(period.pay_start) && now <= new Date(period.pay_end);
  const isActionable = isApplying || isPaying;

  let title = period.target_month;
  if (isApplying) title = "구독 신청 기간";
  else if (isPaying && !isPaid) title = "결제 기간";

  let subtitle: string | null = period.target_month;
  if (isApplying) subtitle = period.target_month;
  else if (isPaying && !isPaid) subtitle = "결제하고 '결제 완료'를 눌러주세요";
  else subtitle = null;

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

export function MyPageContent({
  profile,
  period,
  activeSubscriptions,
  archivedSubscriptions,
  initialFavorites,
  initialReviews,
  streak,
  initialPosts,
}: MyPageContentProps) {
  const t = useTranslations("myPage");

  const [favorites, setFavorites] = useState(initialFavorites);
  const [reviews, setReviews] = useState(initialReviews);
  const [posts, setPosts] = useState(initialPosts);
  const [nicknameDialog, setNicknameDialog] = useState(false);
  const [newNickname, setNewNickname] = useState(profile?.nickname ?? "");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [displayNickname, setDisplayNickname] = useState(profile?.nickname ?? "User");
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  async function handleSaveNickname() {
    setIsSavingNickname(true);
    try {
      const result = await updateNickname(newNickname);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDisplayNickname(newNickname.trim());
      setNicknameDialog(false);
      toast.success("닉네임이 변경되었습니다");
    } finally {
      setIsSavingNickname(false);
    }
  }

  async function handleRemoveFavorite(menuId: string) {
    const result = await toggleFavorite(menuId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.menu_id !== menuId));
    toast.success("즐겨찾기가 해제되었습니다");
  }

  async function handleDeleteReview(reviewId: string) {
    const result = await deleteReview(reviewId);
    if (result.error) {
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

  async function handleDeletePost(postId: string) {
    const result = await deletePost(postId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast.success("게시글이 삭제되었습니다");
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{displayNickname}</CardTitle>
                <button
                  onClick={() => {
                    setNewNickname(displayNickname);
                    setNicknameDialog(true);
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
            </div>
            {streak > 0 && (
              <div className="flex items-center gap-1 text-sm text-orange-500">
                <Flame className="h-4 w-4" />
                <span className="font-semibold">{streak}</span>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Active Subscriptions */}
      {activeSubscriptions.length > 0 ? (
        activeSubscriptions.map((entry) => (
          <SubscriptionCard key={entry.subscription.id} entry={entry} />
        ))
      ) : (
        <Link href="/subscription" className="block">
          <Card className="transition-colors hover:bg-accent/50">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <UtensilsCrossed className="h-5 w-5 text-green-500" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-base">구독 신청</CardTitle>
                <p className="text-sm text-muted-foreground">
                  아직 활성 구독이 없습니다
                </p>
              </div>
            </CardHeader>
          </Card>
        </Link>
      )}

      {/* Archived Subscriptions */}
      {archivedSubscriptions.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex w-full items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            <Archive className="h-4 w-4" />
            지난 구독
            <Badge variant="secondary" className="text-xs">
              {archivedSubscriptions.length}
            </Badge>
            {showArchived ? (
              <ChevronUp className="ml-auto h-4 w-4" />
            ) : (
              <ChevronDown className="ml-auto h-4 w-4" />
            )}
          </button>
          {showArchived && (
            <div className="space-y-2">
              {archivedSubscriptions.map((entry) => {
                const { subscription: sub, period: p, deliveryDayCount: count } = entry;
                const totalSalads = count * (sub.salads_per_delivery ?? 1);
                return (
                  <Card key={sub.id} className="bg-muted/30">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.target_month}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            주 {sub.frequency_per_week}회 · 배달당 {sub.salads_per_delivery}개 · 월 {totalSalads}개
                          </p>
                        </div>
                        <Badge
                          variant="secondary"
                          className="gap-1 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                        >
                          완료
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Favorite Menus */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Heart className="h-4 w-4" />
          {t("favoriteMenus")}
          {favorites.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {favorites.length}
            </Badge>
          )}
        </h2>
        {favorites.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">즐겨찾기한 메뉴가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              {favorites.map((fav, idx) => {
                const menu = fav.menu as any;
                if (!menu) return null;
                return (
                  <div key={fav.id}>
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
                          <p className="text-sm text-muted-foreground">
                            {menu.sauce}
                          </p>
                        )}
                      </Link>
                      <button
                        onClick={() => handleRemoveFavorite(menu.id)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {idx < favorites.length - 1 && <Separator />}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>

      {/* My Reviews */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Star className="h-4 w-4" />
          {t("myReviews")}
          {reviews.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {reviews.length}
            </Badge>
          )}
        </h2>
        {reviews.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">작성한 리뷰가 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {reviews.map((review) => {
              const menu = review.menu;
              return (
                <Card key={review.id}>
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
                          <p className="text-sm font-medium">
                            {menu?.title ?? "메뉴"}
                          </p>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => setEditingReview(review)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteReview(review.id)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
            })}
          </div>
        )}
      </div>

      {/* My Posts */}
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          {t("myPosts")}
          {posts.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {posts.length}
            </Badge>
          )}
        </h2>
        {posts.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-sm">작성한 게시글이 없습니다</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <Link key={post.id} href={`/community/${post.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">
                          {post.title}
                        </p>
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
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          handleDeletePost(post.id);
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={handleLogout}
        disabled={isLoggingOut}
      >
        {isLoggingOut ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="mr-2 h-4 w-4" />
        )}
        로그아웃
      </Button>

      {/* Nickname Edit Dialog */}
      <Dialog open={nicknameDialog} onOpenChange={setNicknameDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>닉네임 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>닉네임</Label>
              <Input
                value={newNickname}
                onChange={(e) => setNewNickname(e.target.value)}
                placeholder="새 닉네임 입력"
                maxLength={20}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setNicknameDialog(false)}
              >
                취소
              </Button>
              <Button
                onClick={handleSaveNickname}
                disabled={isSavingNickname || !newNickname.trim()}
              >
                {isSavingNickname && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                저장
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
