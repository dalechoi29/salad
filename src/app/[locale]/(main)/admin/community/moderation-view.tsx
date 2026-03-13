"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Trash2,
  MessageCircle,
  ThumbsUp,
  Eye,
  Loader2,
  MessageSquare,
  Shield,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  adminDeletePost,
  adminDeleteComment,
  getAdminComments,
} from "@/lib/actions/admin";

import { timeAgo } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  general: "자유",
  ceo: "사장님께 한마디",
  preference: "메뉴 취향",
  tip: "꿀팁",
  etc: "기타",
};

interface ModerationViewProps {
  initialPosts: any[];
  initialTotal: number;
}

export function ModerationView({ initialPosts, initialTotal }: ModerationViewProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [total, setTotal] = useState(initialTotal);
  const [detailPost, setDetailPost] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);

  async function handleDeletePost(postId: string) {
    if (!confirm("이 게시글을 삭제하시겠습니까?")) return;

    const result = await adminDeletePost(postId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setTotal((prev) => prev - 1);
    toast.success("게시글이 삭제되었습니다");
  }

  async function handleViewComments(post: any) {
    setDetailPost(post);
    setIsLoadingComments(true);
    try {
      const data = await getAdminComments(post.id);
      setComments(data);
    } finally {
      setIsLoadingComments(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    const result = await adminDeleteComment(commentId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    toast.success("댓글이 삭제되었습니다");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">커뮤니티 관리</h1>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        전체 게시글: {total}개
      </p>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">게시글이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <Card key={post.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-[10px]">
                        {CATEGORY_LABELS[post.category] ?? post.category ?? "자유"}
                      </Badge>
                      <p className="truncate text-sm font-medium">{post.title}</p>
                    </div>
                    {post.content && (
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {post.content}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {post.profile?.nickname ?? "익명"}
                      </span>
                      <span>{post.profile?.email}</span>
                      <span>{timeAgo(post.created_at)}</span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp className="h-3 w-3" />
                        {post.vote_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageCircle className="h-3 w-3" />
                        {post.comment_count ?? 0}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleViewComments(post)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleDeletePost(post.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Post detail + comments dialog */}
      <Dialog open={!!detailPost} onOpenChange={(open) => !open && setDetailPost(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">{detailPost?.title}</DialogTitle>
          </DialogHeader>
          {detailPost && (
            <div className="space-y-4 pt-2">
              <div className="text-xs text-muted-foreground">
                {detailPost.profile?.nickname} ({detailPost.profile?.email}) · {timeAgo(detailPost.created_at)}
              </div>
              {detailPost.content && (
                <p className="whitespace-pre-line text-sm">{detailPost.content}</p>
              )}

              <div className="border-t pt-3">
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                  <MessageCircle className="h-4 w-4" />
                  댓글
                </h4>
                {isLoadingComments ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <p className="py-2 text-center text-xs text-muted-foreground">
                    댓글이 없습니다
                  </p>
                ) : (
                  <div className="space-y-2">
                    {comments.map((comment) => (
                      <div
                        key={comment.id}
                        className="flex items-start justify-between rounded-lg border px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">
                              {comment.profile?.nickname ?? "익명"}
                            </span>
                            <span>{comment.profile?.email}</span>
                            <span>{timeAgo(comment.created_at)}</span>
                          </div>
                          <p className="mt-1 whitespace-pre-line text-sm">
                            {comment.content}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 flex-shrink-0 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteComment(comment.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
