import { getHomeStripData } from "@/lib/actions/home-page";
import type { HomeStripLoaderParams } from "@/lib/home-page-types";
import { HomeStripHydrator } from "./home-strip-hydration";

export async function HomeStripServerLoader({
  isLoggedIn,
  loggedInStripDates,
  guestStripDates,
  stripSelections,
}: HomeStripLoaderParams) {
  const data = await getHomeStripData(
    isLoggedIn,
    loggedInStripDates,
    guestStripDates,
    stripSelections
  );
  return <HomeStripHydrator data={data} />;
}
