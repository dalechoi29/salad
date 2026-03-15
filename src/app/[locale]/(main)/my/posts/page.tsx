import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getMyPosts } from "@/lib/actions/community";
import { PostsListView } from "./posts-list-view";

export default async function PostsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const posts = await getMyPosts();

  return <PostsListView initialPosts={posts} />;
}
