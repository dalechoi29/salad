import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentProfile } from "@/lib/actions/auth";
import { getMyFavorites } from "@/lib/actions/menu";
import { FavoritesListView } from "./favorites-list-view";

export default async function FavoritesPage() {
  const profile = await getCurrentProfile();
  if (!profile) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }

  const favorites = await getMyFavorites();

  return <FavoritesListView initialFavorites={favorites} />;
}
