import { getAdminPosts } from "@/lib/actions/admin";
import { getCommunityCategories } from "@/lib/actions/category";
import { ModerationView } from "./moderation-view";

export default async function AdminCommunityPage() {
  const [{ posts, total }, categories] = await Promise.all([
    getAdminPosts(),
    getCommunityCategories(),
  ]);
  return <ModerationView initialPosts={posts} initialTotal={total} categories={categories} />;
}
