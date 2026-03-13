import { getAdminPosts } from "@/lib/actions/admin";
import { ModerationView } from "./moderation-view";

export default async function AdminCommunityPage() {
  const { posts, total } = await getAdminPosts();
  return <ModerationView initialPosts={posts} initialTotal={total} />;
}
