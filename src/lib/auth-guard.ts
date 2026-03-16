import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { Profile } from "@/types";

/**
 * Checks if the user is authenticated and approved.
 * Redirects to login if not authenticated, or to pending if not approved.
 * Returns the profile if everything is valid.
 */
export async function requireAuth(): Promise<Profile | null> {
  const supabase = await createClient();
  const user = await getAuthUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  if (profile.status === "pending") {
    redirect("/pending");
  }

  if (profile.status === "disabled") {
    await supabase.auth.signOut();
    return null;
  }

  return profile as Profile;
}

/**
 * Checks if the user is an admin. Returns profile or redirects.
 */
export async function requireAdmin(): Promise<Profile | null> {
  const profile = await requireAuth();

  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  return profile;
}
