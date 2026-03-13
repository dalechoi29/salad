import { getPosts } from "@/lib/actions/community";
import { CommunityView } from "./community-view";

export default async function CommunityPage() {
  const posts = await getPosts("newest");
  return <CommunityView initialPosts={posts} />;
}
