"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ActionResult, CommunityCategory } from "@/types";

export async function getCommunityCategories(): Promise<CommunityCategory[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("community_categories")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as CommunityCategory[]) ?? [];
}

export async function createCommunityCategory(
  key: string,
  label: string,
  color: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { data: maxOrder } = await supabase
    .from("community_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const nextOrder = (maxOrder?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("community_categories").insert({
    key,
    label,
    color,
    sort_order: nextOrder,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateCommunityCategory(
  id: string,
  label: string,
  color: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("community_categories")
    .update({ label, color })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteCommunityCategory(
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  const { error } = await supabase
    .from("community_categories")
    .delete()
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function reorderCommunityCategories(
  orderedIds: string[]
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "AUTH_REQUIRED" };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("community_categories")
      .update({ sort_order: i })
      .eq("id", orderedIds[i]);
    if (error) return { error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}
