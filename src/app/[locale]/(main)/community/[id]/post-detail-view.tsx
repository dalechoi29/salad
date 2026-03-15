"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  MessageCircle,
  Send,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { useUser } from "@/components/providers/user-provider";
import {
  vote,
  createComment,
  deleteComment,
  deletePost,
  updatePost,
  getComments,
} from "@/lib/actions/community";
import { handleActionError } from "@/lib/handle-action-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { timeAgo } from "@/lib/utils";
import type { Post, Comment, Vote, PostCategory, CommunityCategory } from "@/types";

interface PostDetailViewProps {
  post: Post;
  initialComments: Comment[];
  initialVote: Vote | null;
  categories: CommunityCategory[];
}

export function PostDetailView({
  post,
  initialComments,
  initialVote,
  categories,
}: PostDetailViewProps) {
  const router = useRouter();
  const { user } = useUser();
  const isOwner = user?.id === post.user_id;
  const isAdmin = user?.role === "admin";

  const categoryLabels: Record<string, string> = {};
  const categoryColors: Record<string, string> = {};
  for (const cat of categories) {
    categoryLabels[cat.key] = cat.label;
    categoryColors[cat.key] = cat.color;
  }

  const [comments, setComments] = useState(initialComments);
  const [myVote, setMyVote] = useState<Vote | null>(initialVote);
  const [voteCount, setVoteCount] = useState(post.vote_count);
  const [commentText, setCommentText] = useState("");
  const [isVoting, setIsVoting] = useState(false);
  const [isCommenting, setIsCommenting] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [editCategory, setEditCategory] = useState<PostCategory>(post.category);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(post.title);
  const [displayContent, setDisplayContent] = useState(post.content);
  const [displayCategory, setDisplayCategory] = useState<PostCategory>(post.category);

  async function handleVote(value: 1 | -1) {
    setIsVoting(true);
    try {
      const result = await vote(post.id, value);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      if (result.newVoteCount !== undefined) {
        setVoteCount(result.newVoteCount);
      }
      if (myVote?.value === value) {
        setMyVote(null);
      } else {
        setMyVote({ id: "", user_id: user?.id ?? "", post_id: post.id, value });
      }
    } finally {
      setIsVoting(false);
    }
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    setIsCommenting(true);
    try {
      const result = await createComment(post.id, commentText);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      setCommentText("");
      const updated = await getComments(post.id);
      setComments(updated);
    } finally {
      setIsCommenting(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    const result = await deleteComment(commentId, post.id);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    toast.success("댓글이 삭제되었습니다");
  }

  async function handleDeletePost() {
    const result = await deletePost(post.id);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    toast.success("게시글이 삭제되었습니다");
    router.push("/community");
  }

  async function handleSaveEdit() {
    setIsSavingEdit(true);
    try {
      const result = await updatePost(post.id, editTitle, editContent, editCategory);
      if (result.error) {
        if (handleActionError(result.error, router)) return;
        toast.error(result.error);
        return;
      }
      setDisplayTitle(editTitle.trim());
      setDisplayContent(editContent.trim());
      setDisplayCategory(editCategory);
      setEditDialog(false);
      toast.success("게시글이 수정되었습니다");
    } finally {
      setIsSavingEdit(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => router.push("/community")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold">게시글</h1>
      </div>

      {/* Post content */}
      <Card>
        <CardContent className="px-6 py-3">
          <div className="space-y-4">
            {/* Title + edit/delete */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold leading-snug">
                {displayTitle}
              </h2>
              {(isOwner || isAdmin) && (
                <div className="flex flex-shrink-0 items-center gap-0.5">
                  {isOwner && (
                    <button
                      onClick={() => {
                        setEditTitle(displayTitle);
                        setEditContent(displayContent);
                        setEditCategory(displayCategory);
                        setEditDialog(true);
                      }}
                      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={handleDeletePost}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Author & date */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-medium">
                익명
              </span>
              <span>·</span>
              <span>{timeAgo(post.created_at)}</span>
            </div>

            {/* Content */}
            {displayContent && (
              <>
                <Separator />
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  {displayContent}
                </p>
              </>
            )}

            {/* Category tag below content */}
            <Badge
              variant="secondary"
              className={`w-fit text-sm ${categoryColors[displayCategory] ?? ""}`}
            >
              {categoryLabels[displayCategory] ?? displayCategory}
            </Badge>

            {/* Vote buttons — icon-only, bigger */}
            <Separator />
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleVote(1)}
                disabled={isVoting}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${
                  myVote?.value === 1
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <ThumbsUp className={`h-4.5 w-4.5 ${myVote?.value === 1 ? "fill-primary" : ""}`} />
                <span className="font-medium">{voteCount >= 0 ? voteCount : 0}</span>
              </button>
              <button
                onClick={() => handleVote(-1)}
                disabled={isVoting}
                className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm transition-colors ${
                  myVote?.value === -1
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground hover:bg-accent"
                }`}
              >
                <ThumbsDown className={`h-4.5 w-4.5 ${myVote?.value === -1 ? "fill-destructive" : ""}`} />
              </button>
              <div className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-muted-foreground">
                <MessageCircle className="h-4.5 w-4.5" />
                <span className="font-medium">{comments.length}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comments section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          <h3 className="text-sm font-semibold">댓글 ({comments.length})</h3>
        </div>

        {/* Comment input */}
        <div className="flex gap-2">
          <Input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="댓글을 입력해주세요"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAddComment();
              }
            }}
          />
          <Button
            size="icon"
            onClick={handleAddComment}
            disabled={isCommenting || !commentText.trim()}
          >
            {isCommenting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Comment list */}
        {comments.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
          </p>
        ) : (
          <div className="space-y-1">
            {comments.map((comment) => {
              const isCommentOwner = user?.id === comment.user_id;
              return (
                <div
                  key={comment.id}
                  className="rounded-lg border px-3 py-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">
                        익명
                      </span>
                      <span className="text-muted-foreground">
                        {timeAgo(comment.created_at)}
                      </span>
                    </div>
                    {(isCommentOwner || isAdmin) && (
                      <button
                        onClick={() =>
                          handleDeleteComment(comment.id)
                        }
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm">
                    {comment.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>게시글 수정</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select
                value={editCategory}
                onValueChange={(v) => setEditCategory((v ?? "general") as PostCategory)}
              >
                <SelectTrigger>
                  <span className="flex flex-1 text-left">{categoryLabels[editCategory] ?? editCategory}</span>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.key} value={cat.key} label={cat.label}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>내용</Label>
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setEditDialog(false)}
              >
                취소
              </Button>
              <Button
                onClick={handleSaveEdit}
                disabled={isSavingEdit || !editTitle.trim()}
              >
                {isSavingEdit && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                수정 완료
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
