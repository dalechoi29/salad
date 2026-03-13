"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare,
  Plus,
  ThumbsUp,
  MessageCircle,
  Loader2,
  Clock,
  TrendingUp,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createPost, getPosts, vote } from "@/lib/actions/community";
import { useRouter } from "@/i18n/navigation";
import { timeAgo } from "@/lib/utils";
import type { Post, PostCategory } from "@/types";

const CATEGORIES: { value: "all" | PostCategory; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "general", label: "자유" },
  { value: "ceo", label: "사장님께 한마디" },
  { value: "preference", label: "메뉴 취향" },
  { value: "tip", label: "꿀팁" },
  { value: "etc", label: "기타" },
];

const CATEGORY_LABELS: Record<string, string> = {
  general: "자유",
  ceo: "사장님께 한마디",
  preference: "메뉴 취향",
  tip: "꿀팁",
  etc: "기타",
};

const CATEGORY_COLORS: Record<string, string> = {
  general: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  ceo: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  preference: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  tip: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  etc: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function PostCard({ post, onVoteChange }: { post: Post; onVoteChange: (id: string, newCount: number) => void }) {
  const [liked, setLiked] = useState(false);
  const [voteCount, setVoteCount] = useState(post.vote_count);
  const [isVoting, setIsVoting] = useState(false);

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isVoting) return;
    setIsVoting(true);
    try {
      const result = await vote(post.id, 1);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.newVoteCount !== undefined) {
        setVoteCount(result.newVoteCount);
        onVoteChange(post.id, result.newVoteCount);
      }
      setLiked((prev) => !prev);
    } finally {
      setIsVoting(false);
    }
  }

  const contentPreview = post.content
    ? post.content.length > 80
      ? post.content.slice(0, 80) + "…"
      : post.content
    : "";

  return (
    <Link href={`/community/${post.id}`}>
      <Card className="transition-colors hover:bg-accent/50">
        <CardContent className="px-6 py-2">
          <Badge
            variant="secondary"
            className={`mb-1.5 w-fit text-xs ${CATEGORY_COLORS[post.category] ?? ""}`}
          >
            {CATEGORY_LABELS[post.category] ?? post.category}
          </Badge>
          <p className="text-lg font-semibold leading-snug">
            {post.title}
          </p>
          {contentPreview && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {contentPreview}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>{post.profile?.nickname ?? "익명"}</span>
              <span>{timeAgo(post.created_at)}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <button
                onClick={handleLike}
                disabled={isVoting}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors hover:bg-primary/10 ${liked ? "text-primary" : ""}`}
              >
                <ThumbsUp className={`h-4 w-4 ${liked ? "fill-primary" : ""}`} />
                <span>{voteCount}</span>
              </button>
              <div className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                <span>{post.comment_count ?? 0}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

interface CommunityViewProps {
  initialPosts: Post[];
}

export function CommunityView({ initialPosts }: CommunityViewProps) {
  const t = useTranslations("community");
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [sort, setSort] = useState<"newest" | "popular">("newest");
  const [activeCategory, setActiveCategory] = useState<"all" | PostCategory>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postCategory, setPostCategory] = useState<PostCategory>("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function reload(
    newSort: "newest" | "popular" = sort,
    newCategory: "all" | PostCategory = activeCategory
  ) {
    setIsLoading(true);
    try {
      const data = await getPosts(
        newSort,
        newCategory === "all" ? undefined : newCategory
      );
      setPosts(data);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSortChange(newSort: "newest" | "popular") {
    if (newSort === sort) return;
    setSort(newSort);
    await reload(newSort, activeCategory);
  }

  async function handleCategoryChange(cat: "all" | PostCategory) {
    if (cat === activeCategory) return;
    setActiveCategory(cat);
    await reload(sort, cat);
  }

  async function handleCreatePost() {
    setIsSubmitting(true);
    try {
      const result = await createPost(title, content, postCategory);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("게시글이 등록되었습니다");
      setDialogOpen(false);
      setTitle("");
      setContent("");
      setPostCategory("general");
      if (result.postId) {
        router.push(`/community/${result.postId}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("newPost")}
        </Button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => (
          <Button
            key={cat.value}
            variant={activeCategory === cat.value ? "default" : "outline"}
            size="sm"
            className="h-7 flex-shrink-0 text-sm"
            onClick={() => handleCategoryChange(cat.value)}
          >
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Sort buttons */}
      <div className="flex gap-2">
        <Button
          variant={sort === "newest" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-sm"
          onClick={() => handleSortChange("newest")}
        >
          <Clock className="mr-1 h-3 w-3" />
          최신순
        </Button>
        <Button
          variant={sort === "popular" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-sm"
          onClick={() => handleSortChange("popular")}
        >
          <TrendingUp className="mr-1 h-3 w-3" />
          인기순
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <MessageSquare className="h-8 w-8" />
            <p className="text-sm">{t("noPost")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} onVoteChange={(id, newCount) => {
              setPosts((prev) => prev.map((p) => p.id === id ? { ...p, vote_count: newCount } : p));
            }} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("writePost")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select
                value={postCategory}
                onValueChange={(v) => setPostCategory((v ?? "general") as PostCategory)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.filter((c) => c.value !== "all").map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="제목을 입력해주세요"
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label>내용</Label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="내용을 입력해주세요"
                rows={6}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                취소
              </Button>
              <Button
                onClick={handleCreatePost}
                disabled={isSubmitting || !title.trim()}
              >
                {isSubmitting && (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                )}
                등록
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
