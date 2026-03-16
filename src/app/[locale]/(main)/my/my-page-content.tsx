"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Loader2,
  Shield,
  MessageSquare,
  KeyRound,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateNickname, logout, changePassword } from "@/lib/actions/auth";
import { toggleFavorite } from "@/lib/actions/menu";
import { deleteReview } from "@/lib/actions/review";
import { deletePost } from "@/lib/actions/community";
import { handleActionError } from "@/lib/handle-action-error";
import { ReviewEditDialog } from "@/components/shared/review-edit-dialog";
import { SubscriptionCard, FavoriteItem, ReviewItem, PostItem } from "./my-list-items";
import type { Profile, SubscriptionPeriod, MenuFavorite, Review, Post } from "@/types";
import type { SubscriptionWithDetails } from "./page";

interface MyPageContentProps {
  profile: Profile | null;
  period: SubscriptionPeriod | null;
  subscriptions: SubscriptionWithDetails[];
  initialFavorites: MenuFavorite[];
  initialReviews: Review[];
  streak: number;
  initialPosts: Post[];
}

export function MyPageContent({
  profile,
  period,
  subscriptions,
  initialFavorites,
  initialReviews,
  streak,
  initialPosts,
}: MyPageContentProps) {
  const t = useTranslations("myPage");
  const router = useRouter();

  const [favorites, setFavorites] = useState(initialFavorites);
  const [reviews, setReviews] = useState(initialReviews);
  const [posts, setPosts] = useState(initialPosts);
  const [nicknameDialog, setNicknameDialog] = useState(false);
  const [newNickname, setNewNickname] = useState(profile?.nickname ?? "");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [displayNickname, setDisplayNickname] = useState(profile?.nickname ?? "User");
  const [editingReview, setEditingReview] = useState<Review | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function handleSaveNickname() {
    setIsSavingNickname(true);
    try {
      const result = await updateNickname(newNickname);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
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
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setFavorites((prev) => prev.filter((f) => f.menu_id !== menuId));
    toast.success("즐겨찾기가 해제되었습니다");
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

  async function handleDeletePost(postId: string) {
    const result = await deletePost(postId);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast.success("게시글이 삭제되었습니다");
  }

  async function handleChangePassword() {
    if (currentPw.length !== 4 || newPw.length !== 4) {
      toast.error("4자리 비밀번호를 입력해주세요");
      return;
    }
    setIsSavingPassword(true);
    const result = await changePassword(currentPw, newPw);
    setIsSavingPassword(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("비밀번호가 변경되었습니다");
    setPasswordDialog(false);
    setCurrentPw("");
    setNewPw("");
  }

  async function handleLogout() {
    setIsLoggingOut(true);
    await logout();
    router.replace("/");
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

      {/* Subscriptions */}
      {subscriptions.length > 0 ? (
        <div className="space-y-2">
          {subscriptions.map((entry) => (
            <SubscriptionCard key={entry.subscription.id} entry={entry} />
          ))}
          {subscriptions.length > 1 && (
            <Link href="/my/subscriptions" className={cn("block mt-3", buttonVariants({ variant: "outline" }), "w-full")}>
              구독 이력 보기
            </Link>
          )}
        </div>
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
          <>
            <Card>
              <CardContent className="p-0">
                {favorites.slice(0, 1).map((fav) => (
                  <FavoriteItem
                    key={fav.id}
                    fav={fav}
                    onRemove={handleRemoveFavorite}
                  />
                ))}
              </CardContent>
            </Card>
            {favorites.length > 1 && (
              <Link href="/my/favorites" className={cn("block mt-3", buttonVariants({ variant: "outline" }), "w-full")}>
                더보기
              </Link>
            )}
          </>
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
            {reviews.slice(0, 1).map((review) => (
              <ReviewItem
                key={review.id}
                review={review}
                onEdit={setEditingReview}
                onDelete={handleDeleteReview}
              />
            ))}
            {reviews.length > 1 && (
              <Link href="/my/reviews" className={cn("block mt-3", buttonVariants({ variant: "outline" }), "w-full")}>
                더보기
              </Link>
            )}
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
            {posts.slice(0, 1).map((post) => (
              <PostItem
                key={post.id}
                post={post}
                onDelete={handleDeletePost}
              />
            ))}
            {posts.length > 1 && (
              <Link href="/my/posts" className={cn("block mt-3", buttonVariants({ variant: "outline" }), "w-full")}>
                더보기
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Password Change, Logout & Admin */}
      <div className={`grid gap-2 ${["admin", "super_admin"].includes(profile?.role ?? "") ? "grid-cols-3" : "grid-cols-2"}`}>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={() => setPasswordDialog(true)}
        >
          <KeyRound className="mr-2 h-4 w-4" />
          비밀번호 변경
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
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
        {["admin", "super_admin"].includes(profile?.role ?? "") && (
          <Link href="/admin" className="block">
            <Button variant="ghost" className="w-full text-muted-foreground hover:text-primary">
              <Shield className="mr-2 h-4 w-4" />
              관리자
            </Button>
          </Link>
        )}
      </div>

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

      {/* Password Change Dialog */}
      <Dialog
        open={passwordDialog}
        onOpenChange={(open) => {
          setPasswordDialog(open);
          if (!open) {
            setCurrentPw("");
            setNewPw("");
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>비밀번호 변경</DialogTitle>
            <DialogDescription>
              새로운 4자리 숫자 비밀번호를 설정해주세요.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>현재 비밀번호</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="현재 4자리 비밀번호"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label>새 비밀번호</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                placeholder="새 4자리 비밀번호"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setPasswordDialog(false)}
              >
                취소
              </Button>
              <Button
                onClick={handleChangePassword}
                disabled={isSavingPassword || currentPw.length !== 4 || newPw.length !== 4}
              >
                {isSavingPassword && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                변경
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
