"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { deletePost } from "@/lib/actions/community";
import { handleActionError } from "@/lib/handle-action-error";
import { toast } from "sonner";
import { PostItem } from "../my-list-items";
import type { Post } from "@/types";

export function PostsListView({
  initialPosts,
}: {
  initialPosts: Post[];
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);

  async function handleDelete(postId: string) {
    const result = await deletePost(postId);
    if (result.error) {
      if (handleActionError(result.error, router)) return;
      toast.error(result.error);
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    toast.success("게시글이 삭제되었습니다");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <MessageSquare className="h-5 w-5" />
        <h1 className="text-2xl font-bold tracking-tight">내 게시글</h1>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">작성한 게시글이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
