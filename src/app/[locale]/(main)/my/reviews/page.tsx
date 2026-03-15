import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getMyReviews } from "@/lib/actions/review";
import { ReviewsListView } from "./reviews-list-view";

export default async function ReviewsPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/signup`);
  }

  const reviews = await getMyReviews();

  return <ReviewsListView initialReviews={reviews} />;
}
