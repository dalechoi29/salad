"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, Review } from "@/types";

export async function createReview(
  menuId: string,
  pickupDate: string,
  rating: number,
  comment: string,
  imageUrl?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  if (rating < 1 || rating > 5) return { error: "평점은 1~5 사이여야 합니다" };

  const { error } = await supabase.from("reviews").insert({
    user_id: user.id,
    menu_id: menuId,
    pickup_date: pickupDate,
    rating,
    comment: comment.trim(),
    image_url: imageUrl ?? null,
  });

  if (error) return { error: error.message };

  revalidatePath("/pickup");
  revalidatePath("/menu");
  return { success: true };
}

export async function updateReview(
  reviewId: string,
  rating: number,
  comment: string,
  imageUrl?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("reviews")
    .update({
      rating,
      comment: comment.trim(),
      image_url: imageUrl ?? null,
    })
    .eq("id", reviewId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/pickup");
  revalidatePath("/menu");
  return { success: true };
}

export async function deleteReview(reviewId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", reviewId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/pickup");
  revalidatePath("/menu");
  return { success: true };
}

export async function getReviewsForMenu(menuId: string): Promise<Review[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("reviews")
    .select("*, profile:profiles(nickname), menu:menus(id, title, image_url)")
    .eq("menu_id", menuId)
    .order("created_at", { ascending: false });

  return (data as Review[]) ?? [];
}

export async function getMyReviews(): Promise<Review[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("reviews")
    .select("*, menu:menus(id, title, image_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (data as Review[]) ?? [];
}

export async function getMyReviewForPickup(
  menuId: string,
  pickupDate: string
): Promise<Review | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("reviews")
    .select("*, menu:menus(id, title, image_url)")
    .eq("user_id", user.id)
    .eq("menu_id", menuId)
    .eq("pickup_date", pickupDate)
    .single();

  return (data as Review) ?? null;
}
