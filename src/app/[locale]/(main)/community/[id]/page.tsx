import { getPost, getComments, getMyVote } from "@/lib/actions/community";
import { getCommunityCategories } from "@/lib/actions/category";
import { redirect } from "next/navigation";
import { PostDetailView } from "./post-detail-view";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [post, comments, myVote, categories] = await Promise.all([
    getPost(id),
    getComments(id),
    getMyVote(id),
    getCommunityCategories(),
  ]);

  if (!post) redirect("/community");

  return (
    <PostDetailView
      post={post}
      initialComments={comments}
      initialVote={myVote}
      categories={categories}
    />
  );
}
