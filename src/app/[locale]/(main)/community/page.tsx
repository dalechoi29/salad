import { getPosts } from "@/lib/actions/community";
import { getCommunityCategories } from "@/lib/actions/category";
import { CommunityView } from "./community-view";

export default async function CommunityPage() {
  const [posts, categories] = await Promise.all([
    getPosts("newest"),
    getCommunityCategories(),
  ]);
  return <CommunityView initialPosts={posts} categories={categories} />;
}
