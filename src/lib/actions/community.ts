"use server";

import { createClient, getAuthUser } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, Post, Comment, Vote } from "@/types";

// ─── Posts ────────────────────────────────────────────────────

export async function getPosts(
  sort: "newest" | "popular" = "newest",
  category?: string,
  limit = 30,
  offset = 0
): Promise<Post[]> {
  const supabase = await createClient();

  let query = supabase
    .from("posts")
    .select("*, profile:profiles(nickname)")
    .range(offset, offset + limit - 1);

  if (category && category !== "all") {
    query = query.eq("category", category);
  }

  if (sort === "popular") {
    query = query.order("vote_count", { ascending: false }).order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data } = await query;
  return (data as Post[]) ?? [];
}

export async function getPost(postId: string): Promise<Post | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("posts")
    .select("*, profile:profiles(nickname)")
    .eq("id", postId)
    .single();

  return (data as Post) ?? null;
}

export async function createPost(
  title: string,
  content: string,
  category: string = "general"
): Promise<ActionResult & { postId?: string }> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const trimmedTitle = title.trim();
  const trimmedContent = content.trim();

  if (!trimmedTitle) return { error: "제목을 입력해주세요" };
  if (trimmedTitle.length > 100) return { error: "제목은 100자 이하로 입력해주세요" };

  const { data, error } = await supabase
    .from("posts")
    .insert({
      user_id: user.id,
      title: trimmedTitle,
      content: trimmedContent,
      category,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/community");
  return { success: true, postId: data.id };
}

export async function updatePost(
  postId: string,
  title: string,
  content: string,
  category?: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const updateData: Record<string, unknown> = {
    title: title.trim(),
    content: content.trim(),
    updated_at: new Date().toISOString(),
  };
  if (category) updateData.category = category;

  const { error } = await supabase
    .from("posts")
    .update(updateData)
    .eq("id", postId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
  return { success: true };
}

export async function deletePost(postId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId);

  if (error) return { error: error.message };

  revalidatePath("/community");
  return { success: true };
}

export async function getMyPosts(): Promise<Post[]> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return [];

  const { data } = await supabase
    .from("posts")
    .select("*, profile:profiles(nickname)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as Post[]) ?? [];
}

// ─── Comments ─────────────────────────────────────────────────

export async function getComments(postId: string): Promise<Comment[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("comments")
    .select("*, profile:profiles(nickname)")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  return (data as Comment[]) ?? [];
}

export async function createComment(
  postId: string,
  content: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const trimmed = content.trim();
  if (!trimmed) return { error: "댓글을 입력해주세요" };

  const { error } = await supabase.from("comments").insert({
    post_id: postId,
    user_id: user.id,
    content: trimmed,
  });

  if (error) return { error: error.message };

  revalidatePath(`/community/${postId}`);
  revalidatePath("/community");
  return { success: true };
}

export async function deleteComment(
  commentId: string,
  postId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("comments")
    .delete()
    .eq("id", commentId);

  if (error) return { error: error.message };

  revalidatePath(`/community/${postId}`);
  revalidatePath("/community");
  return { success: true };
}

// ─── Votes ────────────────────────────────────────────────────

export async function getMyVote(postId: string): Promise<Vote | null> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return null;

  const { data } = await supabase
    .from("votes")
    .select("*")
    .eq("user_id", user.id)
    .eq("post_id", postId)
    .single();

  return (data as Vote) ?? null;
}

export async function vote(
  postId: string,
  value: 1 | -1
): Promise<ActionResult & { newVoteCount?: number }> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: existing } = await supabase
    .from("votes")
    .select("*")
    .eq("user_id", user.id)
    .eq("post_id", postId)
    .single();

  if (existing) {
    if ((existing as Vote).value === value) {
      // Same vote again = remove vote
      const { error } = await supabase
        .from("votes")
        .delete()
        .eq("id", (existing as Vote).id);
      if (error) return { error: error.message };
    } else {
      // Change vote direction
      const { error } = await supabase
        .from("votes")
        .update({ value })
        .eq("id", (existing as Vote).id);
      if (error) return { error: error.message };
    }
  } else {
    // New vote
    const { error } = await supabase
      .from("votes")
      .insert({ user_id: user.id, post_id: postId, value });
    if (error) return { error: error.message };
  }

  // Fetch updated vote count
  const { data: post } = await supabase
    .from("posts")
    .select("vote_count")
    .eq("id", postId)
    .single();

  revalidatePath("/community");
  revalidatePath(`/community/${postId}`);
  return { success: true, newVoteCount: (post as any)?.vote_count ?? 0 };
}
